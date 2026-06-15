import type { Hooks, LifeCycle, ProfilerApi, RumConfiguration, ViewHistory } from '@datadog/browser-rum-core'
import type { DeflateEncoderStreamId, Encoder, SessionContext, SessionManager } from '@datadog/browser-core'
import {
  BridgeCapability,
  bridgeSupports,
  canUseEventBridge,
  correctedChildSampleRate,
  isSampled,
} from '@datadog/browser-core'
import { mockable } from '@datadog/js-core/util'
import { monitorError } from '@datadog/js-core/monitor'
import type { RUMProfiler } from '../domain/profiling/types'
import { isProfilingSupported } from '../domain/profiling/profilingSupported'
import { startProfilingContext } from '../domain/profiling/profilingContext'
import { lazyLoadProfiler } from './lazyLoadProfiler'
import { createWorkerProfilingCoordinator } from '../domain/profiling/workerProfilingCoordinator'
import type { WorkerProfilingCoordinator } from '../domain/profiling/workerProfilingCoordinator'
import { DEFAULT_RUM_PROFILER_CONFIGURATION } from '../domain/profiling/datadogProfiler'

export function makeProfilerApi(): ProfilerApi {
  let profiler: RUMProfiler | undefined
  let workerCoordinator: WorkerProfilingCoordinator | undefined

  function onRumStart(
    lifeCycle: LifeCycle,
    hooks: Hooks,
    configuration: RumConfiguration,
    sessionManager: SessionManager,
    viewHistory: ViewHistory,
    createEncoder: (streamId: DeflateEncoderStreamId) => Encoder
  ) {
    const session = sessionManager.findTrackedSession() // Check if the session is tracked.

    if (!session) {
      // No session tracked, no profiling.
      // Note: No Profiling context is set at this stage.
      return
    }

    if (!isProfilingSampled(configuration, session)) {
      return
    }

    // Listen to events and add the profiling context to them.
    const profilingContextManager = startProfilingContext(hooks)

    // Browser support check
    if (!mockable(isProfilingSupported)()) {
      profilingContextManager.set({
        status: 'error',
        error_reason: 'not-supported-by-browser',
      })
      return
    }

    workerCoordinator = createWorkerProfilingCoordinator(configuration, lifeCycle, sessionManager, createEncoder)

    mockable(lazyLoadProfiler)()
      .then((createRumProfiler) => {
        if (!createRumProfiler) {
          profilingContextManager.set({ status: 'error', error_reason: 'failed-to-lazy-load' })
          return
        }

        profiler = createRumProfiler(
          configuration,
          lifeCycle,
          sessionManager,
          profilingContextManager,
          createEncoder,
          viewHistory,
          undefined,
          () => workerCoordinator?.getCorrelationIds() ?? []
        )
        profiler.start()

        workerCoordinator?.start(
          DEFAULT_RUM_PROFILER_CONFIGURATION.sampleIntervalMs,
          Math.round((DEFAULT_RUM_PROFILER_CONFIGURATION.collectIntervalMs * 1.5) / DEFAULT_RUM_PROFILER_CONFIGURATION.sampleIntervalMs),
          DEFAULT_RUM_PROFILER_CONFIGURATION.collectIntervalMs
        )
      })
      .catch(monitorError)
  }

  return {
    onRumStart,
    stop: () => {
      profiler?.stop()
      workerCoordinator?.stop()
    },
    getWorkerCoordinator: () => workerCoordinator,
  }
}

function isProfilingSampled(configuration: RumConfiguration, session: SessionContext) {
  if (canUseEventBridge()) {
    // In bridge mode, native SDK owns the sampling decision, skip the rate check
    return bridgeSupports(BridgeCapability.PROFILES)
  }
  return isSampled(
    session.id,
    correctedChildSampleRate(configuration.sessionSampleRate, configuration.profilingSampleRate)
  )
}

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
import type { WorkerProfilingCoordinator } from '../domain/profiling/workerProfiling.types'
import { lazyLoadProfiler } from './lazyLoadProfiler'

export function makeProfilerApi(): ProfilerApi {
  let profiler: RUMProfiler | undefined
  let workerCoordinator: WorkerProfilingCoordinator | undefined

  // Minimal buffer for attachProfilingWorker calls that arrive before the
  // lazy chunk loads. Drained by the coordinator when it's created — all
  // the complex attach/detach/teardown logic lives in the lazy chunk.
  const bufferedWorkerCalls: Array<{ worker: Worker; options?: { name?: string } }> = []

  function attachProfilingWorker(worker: Worker, options?: { name?: string }): () => Promise<void> {
    if (workerCoordinator) {
      return workerCoordinator.attachWorker(worker, options)
    }
    // Coordinator not ready yet — buffer for the lazy chunk to drain
    bufferedWorkerCalls.push({ worker, options })
    return () => Promise.resolve()
  }

  function onRumStart(
    lifeCycle: LifeCycle,
    hooks: Hooks,
    configuration: RumConfiguration,
    sessionManager: SessionManager,
    viewHistory: ViewHistory,
    createEncoder: (streamId: DeflateEncoderStreamId) => Encoder
  ) {
    const session = sessionManager.findTrackedSession()

    if (!session) {
      // No session tracked, no profiling.
      // Note: No Profiling context is set at this stage.
      return
    }

    // Sampling (sticky sampling based on session id, bridge-mode aware)
    if (!isProfilingSampled(configuration, session)) {
      // No sampling, no profiling.
      // Note: No Profiling context is set at this stage.
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

    mockable(lazyLoadProfiler)()
      .then((module) => {
        if (!module) {
          profilingContextManager.set({ status: 'error', error_reason: 'failed-to-lazy-load' })
          return
        }

        const { createRumProfiler, createWorkerProfilingCoordinator, DEFAULT_RUM_PROFILER_CONFIGURATION } = module

        workerCoordinator = createWorkerProfilingCoordinator(configuration, lifeCycle, sessionManager, createEncoder)

        // Worker lifecycle hooks: the main profiler drives worker profiling
        // through these callbacks, so both share a single decision point.
        const workerHooks = {
          onWorkersSessionExpired: () => {
            if (workerCoordinator) {
              workerCoordinator.stop()
            }
          },
          onWorkersSessionRenewed: (isProfilingSampled: boolean) => {
            if (workerCoordinator && isProfilingSampled) {
              workerCoordinator.resumeWorkers()
            }
          },
          onWorkersPaused: () => {
            if (workerCoordinator) {
              workerCoordinator.pauseWorkers()
            }
          },
          onWorkersResumed: () => {
            if (workerCoordinator) {
              workerCoordinator.resumeWorkers()
            }
          },
          onWorkersFlushAndRestart: () => {
            if (workerCoordinator) {
              workerCoordinator.flushAndRestartWorkers()
            }
          },
        }

        profiler = createRumProfiler(
          configuration,
          lifeCycle,
          sessionManager,
          profilingContextManager,
          createEncoder,
          viewHistory,
          undefined,
          () => workerCoordinator?.getCorrelationIds() ?? [],
          workerHooks
        )
        profiler.start()

        workerCoordinator.start(
          DEFAULT_RUM_PROFILER_CONFIGURATION.sampleIntervalMs,
          Math.round(
            (DEFAULT_RUM_PROFILER_CONFIGURATION.collectIntervalMs * 1.5) /
              DEFAULT_RUM_PROFILER_CONFIGURATION.sampleIntervalMs
          ),
          DEFAULT_RUM_PROFILER_CONFIGURATION.collectIntervalMs
        )

        // Drain buffered attachProfilingWorker calls that arrived before the
        // lazy chunk loaded
        for (const call of bufferedWorkerCalls.splice(0)) {
          workerCoordinator.attachWorker(call.worker, call.options)
        }
      })
      .catch(monitorError)
  }

  return {
    onRumStart,
    stop: () => {
      profiler?.stop()
      workerCoordinator?.stop()
    },
    attachProfilingWorker,
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

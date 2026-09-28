import type { Hooks, LifeCycle, ProfilerApi, RumConfiguration, ViewHistory } from '@datadog/browser-rum-core'
import type { DeflateEncoderStreamId, Encoder, SessionContext, SessionManager } from '@datadog/browser-core'
import {
  BridgeCapability,
  bridgeSupports,
  canUseEventBridge,
  correctedChildSampleRate,
  isSampled,
  mockable,
} from '@datadog/browser-core'
import { monitorError } from '@datadog/js-core/monitor'
import type { EarlyProfiler, RUMProfiler } from '../domain/profiling/types'
import { startEarlyProfiler } from '../domain/profiling/earlyProfiler'
import { startProfilingContext } from '../domain/profiling/profilingContext'
import { lazyLoadProfiler } from './lazyLoadProfiler'

export function makeProfilerApi(): ProfilerApi {
  let profiler: RUMProfiler | undefined
  let earlyProfiler: EarlyProfiler | undefined

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

    // Start collecting Profiler samples right away, before the profiler chunk
    // is loaded, so no sample is lost while the chunk is downloading. When
    // possible, this also adopts the Profiler instance started by the early
    // profiler snippet, so samples collected before the SDK was loaded are kept
    // as well.
    const earlyStart = mockable(startEarlyProfiler)()
    if (earlyStart.state === 'error') {
      // Browser support check and Profiler startup errors (e.g. missing
      // `Document-Policy: js-profiling` header) are handled by the early
      // profiler, as collection starts before the profiler chunk is loaded.
      profilingContextManager.set({ status: 'error', error_reason: earlyStart.errorReason })
      return
    }
    earlyProfiler = earlyStart.earlyProfiler
    profilingContextManager.set({ status: 'running', error_reason: undefined })

    mockable(lazyLoadProfiler)()
      .then((createRumProfiler) => {
        if (!createRumProfiler) {
          profilingContextManager.set({ status: 'error', error_reason: 'failed-to-lazy-load' })
          stopEarlyProfiler()
          return
        }

        profiler = createRumProfiler(
          configuration,
          lifeCycle,
          sessionManager,
          profilingContextManager,
          createEncoder,
          viewHistory,
          earlyProfiler
        )
        profiler.start()
        // The profiler chunk took over the early collection.
        earlyProfiler = undefined
      })
      .catch((e: unknown) => {
        stopEarlyProfiler()
        monitorError(e)
      })
  }

  function stopEarlyProfiler() {
    // Stop early collection in case the profiler chunk has not been loaded yet.
    earlyProfiler?.stop()
    earlyProfiler = undefined
  }

  return {
    onRumStart,
    stop: () => {
      stopEarlyProfiler()
      profiler?.stop()
    },
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

import type {
  LifeCycle,
  ViewHistory,
  RumSessionManager,
  RumConfiguration,
  ProfilerApi,
  Hooks,
} from '@datadog/browser-rum-core'
import type { DeflateEncoderStreamId, Encoder } from '@datadog/browser-core'
import { isSampled } from '@datadog/browser-rum-core'
import { addTelemetryDebug, monitorError } from '@datadog/browser-core'
import type { RUMProfiler } from '../domain/profiling/types'
import { isProfilingSupported } from '../domain/profiling/profilingSupported'
import { startProfilingContext } from '../domain/profiling/profilingContext'
import { lazyLoadProfiler } from './lazyLoadProfiler'

export function makeProfilerApi(): ProfilerApi {
  let profiler: RUMProfiler | undefined

  function onRumStart(
    lifeCycle: LifeCycle,
    hooks: Hooks,
    configuration: RumConfiguration,
    sessionManager: RumSessionManager,
    viewHistory: ViewHistory,
    createEncoder: (streamId: DeflateEncoderStreamId) => Encoder
  ) {
    const session = sessionManager.findTrackedSession() // Check if the session is tracked.

    if (!session) {
      // No session tracked, no profiling.
      // Note: No Profiling context is set at this stage.
      return
    }

    // Sampling (sticky sampling based on session id)
    if (!isSampled(session.id, configuration.profilingSampleRate)) {
      // No sampling, no profiling.
      // Note: No Profiling context is set at this stage.
      return
    }

    // Listen to events and add the profiling context to them.
    const profilingContextManager = startProfilingContext(hooks)

    // Browser support check
    if (!isProfilingSupported()) {
      profilingContextManager.set({
        status: 'error',
        error_reason: 'not-supported-by-browser',
      })
      return
    }

    lazyLoadProfiler()
      .then((createRumProfiler) => {
        if (!createRumProfiler) {
          // monitor-until: 2026-01-01, reconsider after profiling GA
          addTelemetryDebug('[DD_RUM] Failed to lazy load the RUM Profiler')
          profilingContextManager.set({ status: 'error', error_reason: 'failed-to-lazy-load' })
          return
        }

        profiler = createRumProfiler(configuration, lifeCycle, sessionManager, profilingContextManager, createEncoder)
        profiler.start(viewHistory.findView())
      })
      .catch(monitorError)
  }

  return {
    onRumStart,
    stop: () => {
      profiler?.stop().catch(monitorError)
    },
  }
}

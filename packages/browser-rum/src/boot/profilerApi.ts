import type { LifeCycle, ViewHistory, RumConfiguration, ProfilerApi, Hooks } from '@datadog/browser-rum-core'
import type { SessionManager, DeflateEncoderStreamId, Encoder } from '@datadog/browser-core'
import { monitorError, correctedChildSampleRate, isSampled, mockable, addTelemetryDebug } from '@datadog/browser-core'
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

    // Sampling (sticky sampling based on session id)
    if (
      !isSampled(
        session.id,
        correctedChildSampleRate(configuration.sessionSampleRate, configuration.profilingSampleRate)
      )
    ) {
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

    // monitor-until: 2026-07-01
    addTelemetryDebug(`[Profiler Session Debug] Session ID before Lazy load: ${session.id}`)

    lazyLoadProfiler()
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
          undefined
        )
        profiler.start()
        // telemetry: report if there is a session id once the lazy-load is done and the profiler is actually starting.
        // monitor-until: 2026-07-01
        addTelemetryDebug(`[Profiler Session Debug] Session ID after lazy load: ${session.id}`)
      })
      .catch(monitorError)
  }

  return {
    onRumStart,
    stop: () => {
      profiler?.stop()
    },
  }
}

import type {
  LifeCycle,
  ViewHistory,
  RumSessionManager,
  RumConfiguration,
  ProfilerApi,
  Hooks,
  RumCoreEvents,
} from '@datadog/browser-rum-core'
import type { DeflateEncoderStreamId, Encoder } from '@datadog/browser-core'
import { isSampled } from '@datadog/browser-rum-core'
import { monitorError } from '@datadog/browser-core'
import type { Pipeline } from '@datadog/browser-core-next'
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
    createEncoder: (streamId: DeflateEncoderStreamId) => Encoder,
    pipeline: Pipeline<RumCoreEvents>
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
          pipeline
        )
        profiler.start()
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

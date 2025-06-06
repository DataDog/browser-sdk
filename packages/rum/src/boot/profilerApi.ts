import type {
  LifeCycle,
  ViewHistory,
  RumSessionManager,
  RumConfiguration,
  ProfilerApi,
  ProfilingContextManager,
} from '@datadog/browser-rum-core'
import { createProfilingContextManager } from '@datadog/browser-rum-core'
import { addTelemetryDebug, monitorError, performDraw } from '@datadog/browser-core'
import type { RUMProfiler } from '../domain/profiling/types'
import { isProfilingSupported } from '../domain/profiling/profilingSupported'
import { lazyLoadProfiler } from './lazyLoadProfiler'

export function makeProfilerApi(): ProfilerApi {
  let profiler: RUMProfiler | undefined
  const profilingContextManager: ProfilingContextManager = createProfilingContextManager('starting')

  function onRumStart(
    lifeCycle: LifeCycle,
    configuration: RumConfiguration,
    sessionManager: RumSessionManager,
    viewHistory: ViewHistory
  ) {
    // Sampling.
    if (!performDraw(configuration.profilingSampleRate)) {
      // No sampling, no profiling, no context.
      profilingContextManager.setProfilingContext(undefined)
      return
    }

    // Browser support check
    if (!isProfilingSupported()) {
      profilingContextManager.setProfilingContext({
        status: 'error',
        error_reason: 'not-supported-by-browser',
      })
      return
    }

    lazyLoadProfiler()
      .then((createRumProfiler) => {
        if (!createRumProfiler) {
          addTelemetryDebug('[DD_RUM] Failed to lazy load the RUM Profiler')
          profilingContextManager.setProfilingContext({ status: 'error', error_reason: 'failed-to-lazy-load' })
          return
        }

        profiler = createRumProfiler(configuration, lifeCycle, sessionManager, profilingContextManager)
        profiler.start(viewHistory.findView())
      })
      .catch(monitorError)
  }

  return {
    onRumStart,
    stop: () => {
      profiler?.stop().catch(monitorError)
    },
    getProfilingContext: profilingContextManager.getProfilingContext,
  }
}

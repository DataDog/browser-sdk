import type { LifeCycle, ViewHistory, RumSessionManager, RumConfiguration } from '@datadog/browser-rum-core'
import { addTelemetryDebug, monitorError, noop, performDraw } from '@datadog/browser-core'
import type { RUMProfiler } from '../domain/profiling/types'
import { isProfilingSupported } from '../domain/profiling/profilingSupported'
import { lazyLoadProfiler } from '../domain/profiling/lazyLoadProfiler'

interface ProfilerApi {
  onRumStart: (
    lifeCycle: LifeCycle,
    configuration: RumConfiguration,
    sessionManager: RumSessionManager,
    viewHistory: ViewHistory
  ) => void
  stop: () => void
}

export function makeProfilerApi(): ProfilerApi {
  const cleanupTasks: Array<() => void> = []

  function stop() {
    cleanupTasks.forEach((task) => task())
    cleanupTasks.length = 0
  }

  function onRumStart(
    lifeCycle: LifeCycle,
    configuration: RumConfiguration,
    sessionManager: RumSessionManager,
    viewHistory: ViewHistory
  ) {
    // Check if Browser is supporting the JS Self-Profiling API
    if (!isProfilingSupported()) {
      return noop
    }

    if (!performDraw(configuration.profilingSampleRate)) {
      // User is not lucky, no profiling!
      return noop
    }

    let profiler: RUMProfiler

    lazyLoadProfiler()
      .then((createRumProfiler) => {
        if (!createRumProfiler) {
          addTelemetryDebug('[DD_RUM] Failed to lazy load the RUM Profiler')
          return
        }

        profiler = createRumProfiler(configuration, lifeCycle, sessionManager)

        profiler.start(viewHistory.findView()?.id)

        cleanupTasks.push(() => {
          profiler?.stop().catch(monitorError)
        })
      })
      .catch(monitorError)
  }

  return {
    onRumStart,
    stop,
  }
}

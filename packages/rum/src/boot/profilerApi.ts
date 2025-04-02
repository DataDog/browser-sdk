import type { LifeCycle, ViewHistory, RumSessionManager, RumConfiguration } from '@datadog/browser-rum-core'
import { addTelemetryDebug, monitorError, performDraw } from '@datadog/browser-core'
import type { RUMProfiler } from '../domain/profiling/types'
import { isProfilingSupported } from '../domain/profiling/profilingSupported'
import { lazyLoadProfiler } from './lazyLoadProfiler'

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
  let profiler: RUMProfiler | undefined

  function onRumStart(
    lifeCycle: LifeCycle,
    configuration: RumConfiguration,
    sessionManager: RumSessionManager,
    viewHistory: ViewHistory
  ) {
    if (!isProfilingSupported() || !performDraw(configuration.profilingSampleRate)) {
      return
    }

    lazyLoadProfiler()
      .then((createRumProfiler) => {
        if (!createRumProfiler) {
          addTelemetryDebug('[DD_RUM] Failed to lazy load the RUM Profiler')
          return
        }

        profiler = createRumProfiler(configuration, lifeCycle, sessionManager)
        profiler.start(viewHistory.findView()?.id)
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

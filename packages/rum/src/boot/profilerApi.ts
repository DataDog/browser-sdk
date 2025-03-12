import type { LifeCycle, ViewHistory, RumSessionManager, RumConfiguration } from '@datadog/browser-rum-core'
import { startProfilingCollection } from '../domain/profiling/profilingCollection'

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
    // Profiling collection
    const { stop: stopProfilingCollection } = startProfilingCollection(
      configuration,
      lifeCycle,
      sessionManager,
      viewHistory
    )
    cleanupTasks.push(stopProfilingCollection)
  }

  return {
    onRumStart,
    stop,
  }
}

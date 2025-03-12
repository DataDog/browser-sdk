import { monitorError, performDraw } from '@datadog/browser-core'

import type { LifeCycle, ViewHistory, RumSessionManager, RumConfiguration , } from '@datadog/browser-rum-core'

import { supportPerformanceTimingEvent, RumPerformanceEntryType } from '@datadog/browser-rum-core'
import { lazyLoadProfiler } from './lazyLoadProfiler'
import { isProfilingSupported } from './profilingSupported'
import type { RUMProfiler, RUMProfilerConfiguration } from './types'

interface ProfilingCollector {
  stop: () => void
  isStarted: () => boolean
  isStopped: () => boolean
}

const NOOP_COLLECTOR: ProfilingCollector = {
  stop: () => {
    /* Nothing to stop */
  },
  isStarted: () => false,
  isStopped: () => true,
}

export const startProfilingCollection = (
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  session: RumSessionManager,
  viewHistory: ViewHistory,
  customProfilerConfiguration?: RUMProfilerConfiguration
): ProfilingCollector => {
  // Check if Browser is supporting the JS Self-Profiling API
  if (!isProfilingSupported()) {
    return NOOP_COLLECTOR
  }

  if (!performDraw(configuration.profilingSampleRate)) {
    // User is not lucky, no profiling!
    return NOOP_COLLECTOR
  }

  let profiler: RUMProfiler

  lazyLoadProfiler()
    .then((createRumProfiler) => {
      if (!createRumProfiler) {
        throw new Error('[DD_RUM] Failed to lazy load the RUM Profiler') // will be caught by the catch block below.
      }

      const isLongAnimationFrameEnabled = supportPerformanceTimingEvent(RumPerformanceEntryType.LONG_ANIMATION_FRAME)

      profiler = createRumProfiler({
        configuration,
        isLongAnimationFrameEnabled,
        lifeCycle,
        session,
        profilerConfiguration: customProfilerConfiguration,
      })

      profiler.start(viewHistory.findView()?.id)
    })
    .catch(monitorError)

  return {
    stop: () => {
      profiler?.stop().catch(monitorError)
    },
    isStarted: () => profiler?.isStarted() === true,
    isStopped: () => profiler?.isStopped() === true,
  }
}

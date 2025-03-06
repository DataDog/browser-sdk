import { monitorError, performDraw } from '@datadog/browser-core'

import type { RumConfiguration } from '../configuration'
import type { LifeCycle } from '../lifeCycle'
import type { RumSessionManager } from '../rumSessionManager'
import type { ViewHistory } from '../contexts/viewHistory'
import { RumPerformanceEntryType, supportPerformanceTimingEvent } from '../../browser/performanceObservable'
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
        return
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

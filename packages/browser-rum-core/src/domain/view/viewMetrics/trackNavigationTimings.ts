import type { TimeoutId } from '@openobserve/browser-core'
import type { Duration } from '@openobserve/js-core/time'
import { setTimeout, runOnReadyState, clearTimeout, mockable } from '@openobserve/browser-core'
import type { RumPerformanceNavigationTiming } from '../../../browser/performanceObservable'
import { getNavigationEntry, sanitizeFirstByte } from '../../../browser/performanceUtils'

export interface NavigationTimings {
  domComplete: Duration
  domContentLoaded: Duration
  domInteractive: Duration
  loadEvent: Duration
  firstByte: Duration | undefined
}

// This is a subset of "RumPerformanceNavigationTiming" that only contains the relevant fields for
// computing navigation timings. This is useful to mock the navigation entry in tests.
export type RelevantNavigationTiming = Pick<
  RumPerformanceNavigationTiming,
  'domComplete' | 'domContentLoadedEventEnd' | 'domInteractive' | 'loadEventEnd' | 'responseStart'
>

export function trackNavigationTimings(callback: (timings: NavigationTimings) => void) {
  return waitAfterLoadEvent(() => {
    const entry = mockable(getNavigationEntry)()

    if (!isIncompleteNavigation(entry)) {
      callback(processNavigationEntry(entry))
    }
  })
}

function processNavigationEntry(entry: RelevantNavigationTiming): NavigationTimings {
  return {
    domComplete: entry.domComplete,
    domContentLoaded: entry.domContentLoadedEventEnd,
    domInteractive: entry.domInteractive,
    loadEvent: entry.loadEventEnd,
    firstByte: sanitizeFirstByte(entry),
  }
}

function isIncompleteNavigation(entry: RelevantNavigationTiming) {
  return entry.loadEventEnd <= 0
}

function waitAfterLoadEvent(callback: () => void) {
  let timeoutId: TimeoutId | undefined
  const { stop: stopOnReadyState } = runOnReadyState('complete', () => {
    // Invoke the callback a bit after the actual load event, so the "loadEventEnd" timing is accurate
    timeoutId = setTimeout(() => callback())
  })
  return {
    stop: () => {
      stopOnReadyState()
      clearTimeout(timeoutId)
    },
  }
}

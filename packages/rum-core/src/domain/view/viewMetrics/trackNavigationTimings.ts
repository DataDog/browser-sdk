import type { Duration, TimeoutId } from '@datadog/browser-core'
import { setTimeout, runOnReadyState, clearTimeout } from '@datadog/browser-core'
import type { RumPerformanceNavigationTiming } from '../../../browser/performanceObservable'
import { getNavigationEntry, getSafeFirstByte } from '../../../browser/performanceUtils'
import type { RumConfiguration } from '../../configuration'

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

export function trackNavigationTimings(
  configuration: RumConfiguration,
  callback: (timings: NavigationTimings) => void,
  getNavigationEntryImpl: () => RelevantNavigationTiming = getNavigationEntry
) {
  return waitAfterLoadEvent(configuration, () => {
    const entry = getNavigationEntryImpl()

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
    firstByte: getSafeFirstByte(entry),
  }
}

function isIncompleteNavigation(entry: RelevantNavigationTiming) {
  return entry.loadEventEnd <= 0
}

function waitAfterLoadEvent(configuration: RumConfiguration, callback: () => void) {
  let timeoutId: TimeoutId | undefined
  const { stop: stopOnReadyState } = runOnReadyState(configuration, 'complete', () => {
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

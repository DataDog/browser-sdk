import type { Duration } from '@datadog/browser-core'
import { setTimeout, noop, relativeNow, runOnReadyState } from '@datadog/browser-core'
import type { RelativePerformanceTiming } from '../../../browser/performanceUtils'
import { computeRelativePerformanceTiming } from '../../../browser/performanceUtils'
import type { RumPerformanceNavigationTiming } from '../../../browser/performanceObservable'
import {
  createPerformanceObservable,
  RumPerformanceEntryType,
  supportPerformanceTimingEvent,
} from '../../../browser/performanceObservable'
import type { RumConfiguration } from '../../configuration'

export interface NavigationTimings {
  domComplete: Duration
  domContentLoaded: Duration
  domInteractive: Duration
  loadEvent: Duration
  firstByte: Duration | undefined
}

export function trackNavigationTimings(
  configuration: RumConfiguration,
  callback: (timings: NavigationTimings) => void
) {
  const processEntry = (entry: RumPerformanceNavigationTiming | RelativePerformanceTiming) => {
    if (!isIncompleteNavigation(entry)) {
      callback(processNavigationEntry(entry))
    }
  }

  let stop = noop
  if (supportPerformanceTimingEvent(RumPerformanceEntryType.NAVIGATION)) {
    ;({ unsubscribe: stop } = createPerformanceObservable(configuration, {
      type: RumPerformanceEntryType.NAVIGATION,
      buffered: true,
    }).subscribe((entries) => entries.forEach(processEntry)))
  } else {
    retrieveNavigationTiming(configuration, processEntry)
  }

  return { stop }
}

function processNavigationEntry(entry: RumPerformanceNavigationTiming | RelativePerformanceTiming): NavigationTimings {
  return {
    domComplete: entry.domComplete,
    domContentLoaded: entry.domContentLoadedEventEnd,
    domInteractive: entry.domInteractive,
    loadEvent: entry.loadEventEnd,
    // In some cases the value reported is negative or is larger
    // than the current page time. Ignore these cases:
    // https://github.com/GoogleChrome/web-vitals/issues/137
    // https://github.com/GoogleChrome/web-vitals/issues/162
    firstByte: entry.responseStart >= 0 && entry.responseStart <= relativeNow() ? entry.responseStart : undefined,
  }
}

function isIncompleteNavigation(entry: RumPerformanceNavigationTiming | RelativePerformanceTiming) {
  return entry.loadEventEnd <= 0
}

function retrieveNavigationTiming(
  configuration: RumConfiguration,
  callback: (timing: RelativePerformanceTiming) => void
) {
  runOnReadyState(configuration, 'complete', () => {
    // Send it a bit after the actual load event, so the "loadEventEnd" timing is accurate
    setTimeout(() => callback(computeRelativePerformanceTiming()))
  })
}

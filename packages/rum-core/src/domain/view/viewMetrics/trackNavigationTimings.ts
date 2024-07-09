import type { Duration } from '@datadog/browser-core'
import { assign, forEach, relativeNow, runOnReadyState } from '@datadog/browser-core'
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
  const processEntry = (entry: RumPerformanceNavigationTiming) => {
    if (!isIncompleteNavigation(entry)) {
      callback(processNavigationEntry(entry))
    }
  }

  const { unsubscribe: stop } = createPerformanceObservable(configuration, {
    type: RumPerformanceEntryType.NAVIGATION,
    buffered: true,
  }).subscribe((entries) => forEach(entries, processEntry))

  if (!supportPerformanceTimingEvent(RumPerformanceEntryType.NAVIGATION)) {
    retrieveNavigationTiming(configuration, processEntry)
  }

  return { stop }
}

function processNavigationEntry(entry: RumPerformanceNavigationTiming): NavigationTimings {
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

function isIncompleteNavigation(entry: RumPerformanceNavigationTiming) {
  return entry.loadEventEnd <= 0
}

function retrieveNavigationTiming(
  configuration: RumConfiguration,
  callback: (timing: RumPerformanceNavigationTiming) => void
) {
  function sendFakeTiming() {
    callback(
      assign(computeRelativePerformanceTiming(), {
        entryType: RumPerformanceEntryType.NAVIGATION as const,
      })
    )
  }

  runOnReadyState(configuration, 'complete', () => {
    // Send it a bit after the actual load event, so the "loadEventEnd" timing is accurate
    // eslint-disable-next-line local-rules/disallow-zone-js-patched-values
    setTimeout(sendFakeTiming)
  })
}

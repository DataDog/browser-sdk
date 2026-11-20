import type { TimeoutId } from '@datadog/js-core/util'
import type { Duration } from '@datadog/js-core/time'
import { runOnReadyState } from '@datadog/browser-core'
import { mockable, setTimeout, clearTimeout } from '@datadog/js-core/util'
import type { RumNotRestoredReasons, RumPerformanceNavigationTiming } from '../../../browser/performanceObservable'
import { getNavigationEntry, sanitizeFirstByte } from '../../../browser/performanceUtils'

export interface NavigationTimings {
  domComplete: Duration
  domContentLoaded: Duration
  domInteractive: Duration
  loadEvent: Duration
  firstByte: Duration | undefined
  navigationType?: RumPerformanceNavigationTiming['type']
  notRestoredReasons?: string[]
}

// This is a subset of "RumPerformanceNavigationTiming" that only contains the relevant fields for
// computing navigation timings. This is useful to mock the navigation entry in tests.
export type RelevantNavigationTiming = Pick<
  RumPerformanceNavigationTiming,
  | 'domComplete'
  | 'domContentLoadedEventEnd'
  | 'domInteractive'
  | 'loadEventEnd'
  | 'responseStart'
  | 'type'
  | 'notRestoredReasons'
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
    navigationType: entry.type,
    notRestoredReasons: entry.notRestoredReasons ? collectNotRestoredReasons(entry.notRestoredReasons) : undefined,
  }
}

// Embedded frames can block the back/forward cache too, so their reasons are reported along with the page's.
function collectNotRestoredReasons(node: RumNotRestoredReasons, reasons = new Set<string>()): string[] {
  for (const { reason } of node.reasons || []) {
    reasons.add(reason)
  }
  for (const child of node.children || []) {
    collectNotRestoredReasons(child, reasons)
  }
  return Array.from(reasons)
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

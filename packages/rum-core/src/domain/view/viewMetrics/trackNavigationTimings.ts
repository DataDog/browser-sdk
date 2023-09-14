import type { Duration } from '@datadog/browser-core'
import { relativeNow } from '@datadog/browser-core'
import { RumPerformanceEntryType } from '../../../browser/performanceCollection'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'

export interface NavigationTimings {
  domComplete: Duration
  domContentLoaded: Duration
  domInteractive: Duration
  loadEvent: Duration
  firstByte: Duration | undefined
}

export function trackNavigationTimings(lifeCycle: LifeCycle, callback: (timings: NavigationTimings) => void) {
  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    for (const entry of entries) {
      if (entry.entryType === RumPerformanceEntryType.NAVIGATION) {
        callback({
          domComplete: entry.domComplete,
          domContentLoaded: entry.domContentLoadedEventEnd,
          domInteractive: entry.domInteractive,
          loadEvent: entry.loadEventEnd,
          // In some cases the value reported is negative or is larger
          // than the current page time. Ignore these cases:
          // https://github.com/GoogleChrome/web-vitals/issues/137
          // https://github.com/GoogleChrome/web-vitals/issues/162
          firstByte: entry.responseStart >= 0 && entry.responseStart <= relativeNow() ? entry.responseStart : undefined,
        })
      }
    }
  })

  return { stop }
}

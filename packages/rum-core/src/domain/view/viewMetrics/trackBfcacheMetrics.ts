import type { Duration, RelativeTime } from '@datadog/browser-core'
import type { InitialViewMetrics } from './trackInitialViewMetrics'

// Since TTFB measures network latency, it is not relevant to bfcache and thus no new values will be reported after a bfcache restore.
// This metric will continue to only be reported once per page load.

export function trackBfcacheMetrics(
  pageshowEvent: PageTransitionEvent,
  metrics: InitialViewMetrics,
  scheduleViewUpdate: () => void
): void {
  measureRestoredPaintTime(pageshowEvent, (paintTime) => {
    metrics.firstContentfulPaint = paintTime
    metrics.largestContentfulPaint = { value: paintTime as RelativeTime }
    scheduleViewUpdate()
  })

  measureRestoredFID(pageshowEvent, (fidResult) => {
    metrics.firstInput = {
      delay: fidResult.delay,
      time: fidResult.time as RelativeTime,
      targetSelector: undefined,
    }
    scheduleViewUpdate()
  })
}

function measureRestoredPaintTime(pageshowEvent: PageTransitionEvent, callback: (paintTime: Duration) => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const paintTime = performance.now() - pageshowEvent.timeStamp
      callback(paintTime as Duration)
    })
  })
}

function measureRestoredFID(
  pageshowEvent: PageTransitionEvent,
  callback: (fidResult: { delay: Duration; time: Duration }) => void
): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const fidDelay = 0 as Duration
      const fidTime = performance.now() - pageshowEvent.timeStamp
      callback({ delay: fidDelay, time: fidTime as Duration })
    })
  })
}

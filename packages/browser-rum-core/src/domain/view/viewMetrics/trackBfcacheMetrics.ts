import type { RelativeTime, ClocksState } from '@datadog/browser-core'
import type { InitialViewMetrics } from './trackInitialViewMetrics'
import { trackRestoredFirstContentfulPaint } from './trackFirstContentfulPaint'

/**
 * BFCache keeps a full in-memory snapshot of the DOM. When the page is restored, nothing needs to be fetched, so the whole
 * viewport repaints in a single frame. Consequently, LCP almost always equals FCP.
 * (See: https://github.com/GoogleChrome/web-vitals/pull/87)
 */
export function trackBfcacheMetrics(
  viewStart: ClocksState,
  metrics: InitialViewMetrics,
  scheduleViewUpdate: () => void
) {
  trackRestoredFirstContentfulPaint(viewStart.relative, (paintTime) => {
    metrics.firstContentfulPaint = paintTime
    metrics.largestContentfulPaint = { value: paintTime as RelativeTime }
    scheduleViewUpdate()
  })
}

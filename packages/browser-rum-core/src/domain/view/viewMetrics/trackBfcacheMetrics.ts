import type { RelativeTime, ClocksState } from '@datadog/js-core/time'
import { noop } from '@datadog/js-core/util'
import type { InitialViewMetrics } from './trackInitialViewMetrics'
import { trackRestoredFirstContentfulPaint } from './trackFirstContentfulPaint'

/**
 * BFCache keeps a full in-memory snapshot of the DOM. When the page is restored, nothing needs to be fetched, so the whole
 * viewport repaints in a single frame. Consequently, LCP almost always equals FCP.
 * (See: https://github.com/GoogleChrome/web-vitals/pull/87)
 */
export function trackBfcacheMetrics(viewStart: ClocksState, scheduleViewUpdate: () => void) {
  const initialViewMetrics: InitialViewMetrics = {}

  trackRestoredFirstContentfulPaint(viewStart.relative, (paintTime) => {
    initialViewMetrics.firstContentfulPaint = paintTime
    initialViewMetrics.largestContentfulPaint = { value: paintTime as RelativeTime }
    scheduleViewUpdate()
  })

  return {
    initialViewMetrics,
    stop: noop,
  }
}

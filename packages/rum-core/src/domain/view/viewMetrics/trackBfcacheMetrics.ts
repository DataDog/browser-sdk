import type { Duration, RelativeTime } from '@datadog/browser-core'
import { elapsed, relativeNow } from '@datadog/browser-core'
import type { RumConfiguration } from '../../configuration'
import { retrieveFirstInputTiming } from '../../../browser/firstInputPolyfill'
import type { InitialViewMetrics } from './trackInitialViewMetrics'

// Since TTFB measures network latency, it is not relevant to bfcache and thus no new values will be reported after a bfcache restore.
// This metric will continue to only be reported once per page load.

export function trackBfcacheMetrics(
  configuration: RumConfiguration,
  pageshowEvent: PageTransitionEvent,
  metrics: InitialViewMetrics,
  scheduleViewUpdate: () => void
): { stop: () => void } {
  measureRestoredPaintTime(pageshowEvent, (paintTime) => {
    metrics.firstContentfulPaint = paintTime
    metrics.largestContentfulPaint = { value: paintTime as RelativeTime }
    scheduleViewUpdate()
  })

  const { stop: stopMeasureRestoredFID } = measureRestoredFID(configuration, pageshowEvent, ({ delay, time }) => {
    metrics.firstInput = {
      delay,
      time,
      targetSelector: undefined,
    }
    scheduleViewUpdate()
  })

  return {
    stop: stopMeasureRestoredFID,
  }
}

/**
 * BFCache keeps a full in-memory snapshot of the DOM. When the page is restored, nothing needs to be fetched, so the whole
 * viewport repaints in a single frame. Consequently, LCP almost always equals FCP.
 * (See: https://github.com/GoogleChrome/web-vitals/pull/87)
 */
function measureRestoredPaintTime(pageshowEvent: PageTransitionEvent, callback: (paintTime: Duration) => void): void {
  // Uses two requestAnimationFrame calls to measure FCP after a bfcache restore,
  // as this gives a more accurate timestamp for the frame following the pageshow event.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      callback(elapsed(pageshowEvent.timeStamp as RelativeTime, relativeNow()))
    })
  })
}

function measureRestoredFID(
  configuration: RumConfiguration,
  pageshowEvent: PageTransitionEvent,
  callback: (fid: { delay: Duration; time: RelativeTime }) => void
): { stop: () => void } {
  const { stop } = retrieveFirstInputTiming(configuration, (entry) => {
    callback({
      delay: elapsed(entry.startTime as RelativeTime, entry.processingStart as RelativeTime),
      time: (pageshowEvent.timeStamp - entry.startTime) as RelativeTime,
    })
  })
  return { stop }
}

import type { Duration, RelativeTime } from '@datadog/browser-core'
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
      time: time as RelativeTime,
      targetSelector: undefined,
    }
    scheduleViewUpdate()
  })

  return {
    stop: stopMeasureRestoredFID,
  }
}

// BFCache keeps a full in-memory snapshot of the DOM. When the page is restored, nothing needs to be fetched, so the whole
// viewport repaints in a single frame. Consequently, LCP almost always equals FCP.
// (See: https://github.com/GoogleChrome/web-vitals/pull/87)

function measureRestoredPaintTime(pageshowEvent: PageTransitionEvent, callback: (paintTime: Duration) => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const paintTime = performance.now() - pageshowEvent.timeStamp
      callback(paintTime as Duration)
    })
  })
}

function measureRestoredFID(
  configuration: RumConfiguration,
  pageshowEvent: PageTransitionEvent,
  callback: (fid: { delay: Duration; time: Duration }) => void
): { stop: () => void } {
  const { stop } = retrieveFirstInputTiming(configuration, (entry) => {
    callback({
      delay: (entry.processingStart - entry.startTime) as Duration,
      time: (entry.startTime - pageshowEvent.timeStamp) as Duration,
    })
  })
  return { stop }
}

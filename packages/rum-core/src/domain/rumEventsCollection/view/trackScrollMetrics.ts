import type { Duration } from '@datadog/browser-core'
import { ONE_SECOND, throttle, addEventListener, DOM_EVENT } from '@datadog/browser-core'
import { getViewportDimension } from '../../../browser/viewportObservable'
import { getScrollY } from '../../../browser/scroll'

export interface ScrollMetrics {
  maxScrollDepth?: number
  maxscrollHeight?: number
  maxScrollDepthTimestamp?: Duration
}

const THROTTLE_SCROLL_DURATION = ONE_SECOND

export function trackScrollMetrics() {
  const scrollMetrics: ScrollMetrics = {}

  const handleScrollEvent = throttle(
    (event: Event) => {
      const scrollTop = getScrollY()

      const { height } = getViewportDimension()

      const scrollHeight = Math.round(document.documentElement.scrollHeight)
      const scrollDepth = Math.round(Math.min(height + scrollTop, scrollHeight))

      if (scrollDepth > (scrollMetrics.maxScrollDepth || 0)) {
        scrollMetrics.maxScrollDepth = scrollDepth
        scrollMetrics.maxscrollHeight = scrollHeight
        scrollMetrics.maxScrollDepthTimestamp = event.timeStamp as Duration
      }
    },
    THROTTLE_SCROLL_DURATION,
    { leading: false, trailing: true }
  )

  const { stop } = addEventListener(window, DOM_EVENT.SCROLL, handleScrollEvent.throttled)

  return {
    stop: () => {
      handleScrollEvent.cancel()
      stop()
    },
    scrollMetrics,
  }
}

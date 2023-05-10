import type { Duration } from '@datadog/browser-core'
import { throttle, addEventListener, DOM_EVENT } from '@datadog/browser-core'

export interface ScrollMetrics {
  maxScrollDepth?: number
  maxscrollHeight?: number
  maxScrollDepthTimestamp?: Duration
}

export function trackScrollMetrics() {
  const scrollMetrics: ScrollMetrics = {}

  const handleScrollEvent = throttle(
    (event: Event) => {
      const scrollTop =
        window.pageYOffset || (document.documentElement || document.body.parentNode || document.body).scrollTop

      const scrollHeight = Math.round(document.documentElement.scrollHeight)
      const scrollDepth = Math.round(Math.min(document.documentElement.clientHeight + scrollTop, scrollHeight))

      if (scrollDepth > (scrollMetrics?.maxScrollDepth ?? 0)) {
        scrollMetrics.maxScrollDepth = scrollDepth
        scrollMetrics.maxscrollHeight = scrollHeight
        scrollMetrics.maxScrollDepthTimestamp = event.timeStamp as Duration
      }
    },
    1000,
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

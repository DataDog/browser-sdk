import { throttle, addEventListener, DOM_EVENT } from '@datadog/browser-core'

export interface ScrollMetrics {
  maxScrollDepth?: number
  scrollHeight?: number
  isSrollable?: boolean
}

export function trackScrollMetrics() {
  const scrollMetrics: ScrollMetrics = {}

  const handleScrollEvent = throttle(
    () => {
      const scrollTop =
        window.pageYOffset || (document.documentElement || document.body.parentNode || document.body).scrollTop
      const scrollDepth = Math.min(
        document.documentElement.clientHeight + scrollTop,
        document.documentElement.scrollHeight
      )
      scrollMetrics.maxScrollDepth = Math.max(scrollMetrics.maxScrollDepth ?? 0, scrollDepth)
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

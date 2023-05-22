import type { ClocksState, Duration } from '@datadog/browser-core'
import { elapsed, relativeNow, ONE_SECOND, throttle, addEventListener, DOM_EVENT } from '@datadog/browser-core'
import { getViewportDimension } from '../../../browser/viewportObservable'
import { getScrollY } from '../../../browser/scroll'

export interface ScrollMetrics {
  maxScrollDepth?: number
  maxscrollHeight?: number
  maxScrollDepthTime?: Duration
}

const THROTTLE_SCROLL_DURATION = ONE_SECOND

function getScrollMetrics(viewStart: ClocksState) {
  const scrollTop = getScrollY()

  const { height } = getViewportDimension()

  const scrollHeight = Math.round(document.documentElement.scrollHeight)
  const scrollDepth = Math.round(Math.min(height + scrollTop, scrollHeight))
  const now = relativeNow()
  const timeStamp = elapsed(viewStart.relative, now)

  return {
    scrollHeight,
    scrollDepth,
    scrollTop,
    timeStamp,
  }
}

export function trackScrollMetrics(viewStart: ClocksState) {
  // const { scrollHeight, scrollDepth, timeStamp, scrollTop } = getScrollMetrics(viewStart)

  // const scrollMetrics: ScrollMetrics =
  //   scrollTop > 0 ? { maxScrollDepth: scrollDepth, maxscrollHeight: scrollHeight, maxScrollDepthTime: timeStamp } : {}

  const scrollMetrics: ScrollMetrics = {}

  const handleScrollEvent = throttle(
    () => {
      const { scrollHeight, scrollDepth, timeStamp } = getScrollMetrics(viewStart)

      if (scrollDepth > (scrollMetrics.maxScrollDepth || 0)) {
        scrollMetrics.maxScrollDepth = scrollDepth
        scrollMetrics.maxscrollHeight = scrollHeight
        scrollMetrics.maxScrollDepthTime = timeStamp
      }
    },
    THROTTLE_SCROLL_DURATION,
    { leading: false, trailing: true }
  )

  const { stop } = addEventListener(window, DOM_EVENT.SCROLL, handleScrollEvent.throttled, { passive: true })

  return {
    stop: () => {
      handleScrollEvent.cancel()
      stop()
    },
    scrollMetrics,
  }
}

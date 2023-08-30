import type { ClocksState, Duration, Observable } from '@datadog/browser-core'
import { ONE_SECOND, elapsed, relativeNow, throttle, addEventListener, DOM_EVENT } from '@datadog/browser-core'
import type { RumConfiguration } from '../../../configuration'
import { getScrollY } from '../../../../browser/scroll'
import { getViewportDimension } from '../../../../browser/viewportObservable'

/** Arbitrary scroll throttle duration */
export const THROTTLE_SCROLL_DURATION = ONE_SECOND

export interface ScrollMetrics {
  maxDepth: number
  maxDepthScrollHeight: number
  maxDepthScrollTop: number
  maxDepthTime: Duration
}

export function trackScrollMetrics(
  configuration: RumConfiguration,
  viewStart: ClocksState,
  callback: (scrollMetrics: ScrollMetrics) => void,
  scrollHeightObservable: Observable<number>,
  getScrollValues = computeScrollValues
) {
  let maxDepth = 0

  const subscription = scrollHeightObservable.subscribe((scrollHeight) => {
    const { scrollDepth, scrollTop } = getScrollValues()

    const now = relativeNow()
    const maxDepthTime = elapsed(viewStart.relative, now)
    maxDepth = scrollDepth
    callback({
      maxDepth,
      maxDepthScrollHeight: scrollHeight,
      maxDepthTime,
      maxDepthScrollTop: scrollTop,
    })
  })

  const handleScrollEvent = throttle(
    () => {
      subscription.unsubscribe()
      const { scrollHeight, scrollDepth, scrollTop } = getScrollValues()

      if (scrollDepth > maxDepth) {
        const now = relativeNow()
        const maxDepthTime = elapsed(viewStart.relative, now)
        maxDepth = scrollDepth
        callback({
          maxDepth,
          maxDepthScrollHeight: scrollHeight,
          maxDepthTime,
          maxDepthScrollTop: scrollTop,
        })
      }
    },
    THROTTLE_SCROLL_DURATION,
    { leading: false, trailing: true }
  )

  const { stop } = addEventListener(configuration, window, DOM_EVENT.SCROLL, handleScrollEvent.throttled, {
    passive: true,
  })

  return {
    stop: () => {
      handleScrollEvent.cancel()
      subscription.unsubscribe()
      stop()
    },
  }
}

export function computeScrollValues() {
  const scrollTop = getScrollY()

  const { height } = getViewportDimension()

  const scrollHeight = Math.round((document.scrollingElement || document.documentElement).scrollHeight)
  const scrollDepth = Math.round(height + scrollTop)

  return {
    scrollHeight,
    scrollDepth,
    scrollTop,
  }
}

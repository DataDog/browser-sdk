import type { ClocksState, Duration } from '@datadog/browser-core'
import {
  ONE_SECOND,
  elapsed,
  relativeNow,
  throttle,
  addEventListener,
  DOM_EVENT,
  setInterval,
  clearInterval,
  monitor,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../../configuration'
import { getScrollY } from '../../../browser/scroll'
import { getViewportDimension } from '../../../browser/viewportObservable'

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
  getScrollValues = computeScrollValues,
  throttleDuration: number = THROTTLE_SCROLL_DURATION
) {
  let maxScrollDepth = 0
  let maxScrollHeight = 0
  let maxScrollTime = 0 as Duration

  let stop: () => void

  const updateScrollMetrics = (height = 0) => {
    let shouldUpdate = false
    const { scrollDepth, scrollTop } = getScrollValues()
    if (scrollDepth > maxScrollDepth) {
      maxScrollDepth = scrollDepth
      shouldUpdate = true
    }

    if (height > maxScrollHeight) {
      maxScrollHeight = height
      const now = relativeNow()
      maxScrollTime = elapsed(viewStart.relative, now)
      shouldUpdate = true
    }

    if (shouldUpdate) {
      callback({
        maxDepth: maxScrollDepth,
        // TODO: This should be renamed to maxScrollHeight in the next major release
        maxDepthScrollHeight: maxScrollHeight,
        // TODO: This should be renamed to maxScrollTime in the next major release
        maxDepthTime: maxScrollTime,
        maxDepthScrollTop: scrollTop,
      })
    }
  }

  if (window.ResizeObserver) {
    const trotthledUpdateScrollMetrics = throttle(updateScrollMetrics, throttleDuration, {
      leading: false,
      trailing: true,
    })

    const observerTarget = document.scrollingElement || document.documentElement
    const resizeObserver = new ResizeObserver(
      monitor((entries) => {
        const height = Math.round(entries?.[0]?.borderBoxSize?.[0]?.blockSize ?? 0)
        if (height > 0) {
          trotthledUpdateScrollMetrics.throttled(height)
        }
      })
    )
    resizeObserver.observe(observerTarget)
    const eventListener = addEventListener(
      configuration,
      window,
      DOM_EVENT.SCROLL,
      () => trotthledUpdateScrollMetrics.throttled(),
      {
        passive: true,
      }
    )
    stop = () => {
      trotthledUpdateScrollMetrics.cancel()
      resizeObserver.unobserve(observerTarget)
      eventListener.stop()
    }
  } else {
    const id = setInterval(updateScrollMetrics, throttleDuration)
    stop = () => clearInterval(id)
  }

  return {
    stop,
  }
}

export function computeScrollValues() {
  const scrollTop = getScrollY()

  const { height } = getViewportDimension()

  const scrollDepth = Math.round(height + scrollTop)

  return {
    scrollDepth,
    scrollTop,
  }
}

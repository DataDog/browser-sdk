import type { ClocksState, Duration } from '@datadog/browser-core'
import {
  Observable,
  ONE_SECOND,
  elapsed,
  relativeNow,
  throttle,
  addEventListener,
  DOM_EVENT,
  monitor,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../../configuration'
import { getScrollY } from '../../../browser/scroll'
import { getViewportDimension } from '../../../browser/viewportObservable'

/** Arbitrary scroll throttle duration */
export const THROTTLE_SCROLL_DURATION = ONE_SECOND

export interface ScrollMetrics {
  maxDepth: number
  maxScrollHeight: number
  maxDepthScrollTop: number
  maxScrollHeightTime: Duration
}

export function trackScrollMetrics(
  configuration: RumConfiguration,
  viewStart: ClocksState,
  callback: (scrollMetrics: ScrollMetrics) => void,
  scrollValues = createScrollValuesObservable(configuration)
) {
  let maxScrollDepth = 0
  let maxScrollHeight = 0
  let maxScrollHeightTime = 0 as Duration

  const subscription = scrollValues.subscribe(({ scrollDepth, scrollTop, scrollHeight }) => {
    let shouldUpdate = false

    if (scrollDepth > maxScrollDepth) {
      maxScrollDepth = scrollDepth
      shouldUpdate = true
    }

    if (scrollHeight > maxScrollHeight) {
      maxScrollHeight = scrollHeight
      const now = relativeNow()
      maxScrollHeightTime = elapsed(viewStart.relative, now)
      shouldUpdate = true
    }

    if (shouldUpdate) {
      callback({
        maxDepth: Math.min(maxScrollDepth, maxScrollHeight),
        maxDepthScrollTop: scrollTop,
        maxScrollHeight,
        maxScrollHeightTime,
      })
    }
  })

  return {
    stop: () => subscription.unsubscribe(),
  }
}

export interface ScrollValues {
  scrollDepth: number
  scrollTop: number
  scrollHeight: number
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

export function createScrollValuesObservable(
  configuration: RumConfiguration,
  throttleDuration = THROTTLE_SCROLL_DURATION
): Observable<ScrollValues> {
  return new Observable<ScrollValues>((observable) => {
    function notify() {
      observable.notify(computeScrollValues())
    }

    if (window.ResizeObserver) {
      const throttledNotify = throttle(notify, throttleDuration, {
        leading: false,
        trailing: true,
      })

      const observerTarget = document.scrollingElement || document.documentElement
      const resizeObserver = new ResizeObserver(monitor(throttledNotify.throttled))
      resizeObserver.observe(observerTarget)
      const eventListener = addEventListener(configuration, window, DOM_EVENT.SCROLL, throttledNotify.throttled, {
        passive: true,
      })

      return () => {
        throttledNotify.cancel()
        resizeObserver.unobserve(observerTarget)
        eventListener.stop()
      }
    }
  })
}

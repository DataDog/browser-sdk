import { throttle, DOM_EVENT, addEventListeners, noop } from '@datadog/browser-core'
import { initViewportObservable } from '@datadog/browser-rum-core'
import type { ViewportResizeDimension, VisualViewportRecord } from '../../../types'
import { getVisualViewport } from '../viewports'
import type { ListenerHandler } from './utils'

const VISUAL_VIEWPORT_OBSERVER_THRESHOLD = 200

export type ViewportResizeCallback = (d: ViewportResizeDimension) => void

export type VisualViewportResizeCallback = (data: VisualViewportRecord['data']) => void

export function initViewportResizeObserver(cb: ViewportResizeCallback): ListenerHandler {
  return initViewportObservable().subscribe(cb).unsubscribe
}

export function initVisualViewportResizeObserver(cb: VisualViewportResizeCallback): ListenerHandler {
  if (!window.visualViewport) {
    return noop
  }
  const { throttled: updateDimension, cancel: cancelThrottle } = throttle(
    () => {
      cb(getVisualViewport())
    },
    VISUAL_VIEWPORT_OBSERVER_THRESHOLD,
    {
      trailing: false,
    }
  )
  const removeListener = addEventListeners(
    window.visualViewport,
    [DOM_EVENT.RESIZE, DOM_EVENT.SCROLL],
    updateDimension,
    {
      capture: true,
      passive: true,
    }
  ).stop

  return function stop() {
    removeListener()
    cancelThrottle()
  }
}

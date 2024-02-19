import type { ListenerHandler } from '@datadog/browser-core'
import { throttle, DOM_EVENT, addEventListeners, noop } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { initViewportObservable } from '@datadog/browser-rum-core'
import type { ViewportResizeDimension, VisualViewportRecord } from '../../../types'
import { getVisualViewport } from '../viewports'

const VISUAL_VIEWPORT_OBSERVER_THRESHOLD = 200

export type ViewportResizeCallback = (d: ViewportResizeDimension) => void

export type VisualViewportResizeCallback = (data: VisualViewportRecord['data']) => void

export function initViewportResizeObserver(
  configuration: RumConfiguration,
  cb: ViewportResizeCallback
): ListenerHandler {
  return initViewportObservable(configuration).subscribe(cb).unsubscribe
}

export function initVisualViewportResizeObserver(
  configuration: RumConfiguration,
  cb: VisualViewportResizeCallback
): ListenerHandler {
  const visualViewport = window.visualViewport
  if (!visualViewport) {
    return noop
  }
  const { throttled: updateDimension, cancel: cancelThrottle } = throttle(
    () => {
      cb(getVisualViewport(visualViewport))
    },
    VISUAL_VIEWPORT_OBSERVER_THRESHOLD,
    {
      trailing: false,
    }
  )
  const { stop: removeListener } = addEventListeners(
    configuration,
    visualViewport,
    [DOM_EVENT.RESIZE, DOM_EVENT.SCROLL],
    updateDimension,
    {
      capture: true,
      passive: true,
    }
  )

  return function stop() {
    removeListener()
    cancelThrottle()
  }
}

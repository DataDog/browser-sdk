import { Observable, throttle, addEventListener, DOM_EVENT } from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'

export interface ViewportDimension {
  height: number
  width: number
}

let viewportObservable: Observable<ViewportDimension> | undefined

export function initViewportObservable(configuration: RumConfiguration) {
  if (!viewportObservable) {
    viewportObservable = createViewportObservable(configuration)
  }
  return viewportObservable
}

export function createViewportObservable(configuration: RumConfiguration) {
  return new Observable<ViewportDimension>((observable) => {
    const { throttled: updateDimension } = throttle(() => {
      observable.notify(getViewportDimension())
    }, 200)

    return addEventListener(configuration, window, DOM_EVENT.RESIZE, updateDimension, { capture: true, passive: true })
      .stop
  })
}

// excludes the width and height of any rendered classic scrollbar that is fixed to the visual viewport
export function getViewportDimension(): ViewportDimension {
  const visual = window.visualViewport
  if (visual) {
    return {
      width: Number(visual.width * visual.scale),
      height: Number(visual.height * visual.scale),
    }
  }

  return {
    width: Number(window.innerWidth || 0),
    height: Number(window.innerHeight || 0),
  }
}

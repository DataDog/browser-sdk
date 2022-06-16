import { monitor, Observable, throttle, addEventListener, DOM_EVENT } from '@datadog/browser-core'

export interface ViewportDimension {
  height: number
  width: number
}

let viewportObservable: Observable<ViewportDimension> | undefined

export function initViewportObservable() {
  if (!viewportObservable) {
    viewportObservable = createViewportObservable()
  }
  return viewportObservable
}

export function createViewportObservable() {
  const observable = new Observable<ViewportDimension>(() => {
    const { throttled: updateDimension } = throttle(
      monitor(() => {
        observable.notify(getViewportDimension())
      }),
      200
    )

    return addEventListener(window, DOM_EVENT.RESIZE, updateDimension, { capture: true, passive: true }).stop
  })

  return observable
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

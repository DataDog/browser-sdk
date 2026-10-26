import { globalObject, Observable, throttle } from '@datadog/js-core/util'
import { addEventListener, DOM_EVENT } from '@datadog/js-core/dom'

export interface ViewportDimension {
  height: number
  width: number
  [k: string]: unknown
}

let viewportObservable: Observable<ViewportDimension> | undefined

export function initViewportObservable() {
  if (!viewportObservable) {
    viewportObservable = createViewportObservable()
  }
  return viewportObservable
}

export function createViewportObservable() {
  return new Observable<ViewportDimension>((observable) => {
    const { throttled: updateDimension } = throttle(() => {
      observable.notify(getViewportDimension())
    }, 200)

    return addEventListener(globalObject.window, DOM_EVENT.RESIZE, updateDimension, { capture: true, passive: true })
      .stop
  })
}

// excludes the width and height of any rendered classic scrollbar that is fixed to the visual viewport
export function getViewportDimension(): ViewportDimension {
  const visual = globalObject.visualViewport
  if (visual) {
    return {
      width: Number(visual.width * visual.scale),
      height: Number(visual.height * visual.scale),
    }
  }
  return {
    width: Number(globalObject.innerWidth || 0),
    height: Number(globalObject.innerHeight || 0),
  }
}

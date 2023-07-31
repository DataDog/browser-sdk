import type { RumConfiguration } from '../configuration'
import { getViewportDimension, initViewportObservable } from '../../browser/viewportObservable'

let viewport: { width: number; height: number } | undefined
let stopListeners: (() => void) | undefined

export function getDisplayContext(configuration: RumConfiguration) {
  if (!viewport) {
    viewport = getViewportDimension()
    stopListeners = initViewportObservable(configuration).subscribe((viewportDimension) => {
      viewport = viewportDimension
    }).unsubscribe
  }

  return {
    viewport,
  }
}

export function resetDisplayContext() {
  if (stopListeners) {
    stopListeners()
  }
  viewport = undefined
}

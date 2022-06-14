import { isExperimentalFeatureEnabled } from '@datadog/browser-core'
import { getViewportDimension, initViewportObservable } from '../../browser/viewportObservable'

let viewport: { width: number; height: number } | undefined
let stopListeners: (() => void) | undefined

export function getDisplayContext() {
  if (!isExperimentalFeatureEnabled('clickmap')) return

  if (!viewport) {
    viewport = getViewportDimension()
    stopListeners = initViewportObservable().subscribe((viewportDimension) => {
      viewport = viewportDimension
    }).unsubscribe
  }

  return {
    viewport,
  }
}

export function resetDisplayContext() {
  if (stopListeners) stopListeners()
  viewport = undefined
}

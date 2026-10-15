import { addEventListener, DOM_EVENT } from '@datadog/js-core/dom'
import { globalObject, mockable, noop } from '@datadog/js-core/util'

export function onBFCacheRestore(callback: (event: PageTransitionEvent) => void): () => void {
  const window = mockable(globalObject.window)
  if (!window) {
    return noop
  }
  const { stop } = addEventListener(
    window,
    DOM_EVENT.PAGE_SHOW,
    (event: PageTransitionEvent) => {
      if (event.persisted) {
        callback(event)
      }
    },
    { capture: true }
  )
  return stop
}

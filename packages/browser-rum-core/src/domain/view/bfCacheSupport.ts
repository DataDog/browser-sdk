import { addEventListener, DOM_EVENT } from '@datadog/js-core/dom'
import { globalObject, noop } from '@datadog/js-core/util'

export function onBFCacheRestore(callback: (event: PageTransitionEvent) => void): () => void {
  const window = globalObject.window
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

import { addEventListener, DOM_EVENT } from '@openobserve/browser-core'

export function onBFCacheRestore(callback: (event: PageTransitionEvent) => void): () => void {
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

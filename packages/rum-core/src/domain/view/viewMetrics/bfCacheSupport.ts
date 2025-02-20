import { monitor, addEventListener, DOM_EVENT } from '@datadog/browser-core'

export function onBFCacheRestore(callback: (event: PageTransitionEvent) => void) {
  addEventListener(
    { allowUntrustedEvents: false },
    window,
    DOM_EVENT.PAGE_SHOW,
    monitor((event: PageTransitionEvent) => {
      if (event.persisted) {
        callback(event)
      }
    }),
    { capture: true }
  )
}

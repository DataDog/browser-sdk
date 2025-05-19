import type { Configuration } from '@datadog/browser-core'
import { addEventListener, DOM_EVENT } from '@datadog/browser-core'

export function onBFCacheRestore(
  configuration: Configuration,
  callback: (event: PageTransitionEvent) => void
): () => void {
  const { stop } = addEventListener(
    configuration,
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

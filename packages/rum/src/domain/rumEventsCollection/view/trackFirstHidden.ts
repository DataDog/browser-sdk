import { addGlobalEventListeners, DOM_EVENT } from '@datadog/browser-core'

let trackFirstHiddenSingleton: { timeStamp: number } | undefined
let stopListeners: (() => void) | undefined

export function trackFirstHidden() {
  if (!trackFirstHiddenSingleton) {
    ;({ stop: stopListeners } = addGlobalEventListeners(
      [DOM_EVENT.PAGE_HIDE],
      ({ timeStamp }) => {
        trackFirstHiddenSingleton!.timeStamp = timeStamp
      },
      { capture: true }
    ))

    trackFirstHiddenSingleton = {
      timeStamp: document.visibilityState === 'hidden' ? 0 : Infinity,
    }
  }

  return trackFirstHiddenSingleton
}

export function resetFirstHidden() {
  if (stopListeners) {
    stopListeners()
  }
  trackFirstHiddenSingleton = undefined
}

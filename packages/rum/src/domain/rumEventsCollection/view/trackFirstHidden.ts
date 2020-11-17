import { addEventListeners, DOM_EVENT } from '@datadog/browser-core'

let trackFirstHiddenSingleton: { timeStamp: number } | undefined
let stopListeners: (() => void) | undefined

export function trackFirstHidden(target: { addEventListener: Window['addEventListener'] } = window) {
  if (!trackFirstHiddenSingleton) {
    ;({ stop: stopListeners } = addEventListeners(
      window,
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

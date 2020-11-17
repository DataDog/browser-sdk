import { addEventListeners, DOM_EVENT, EventEmitter } from '@datadog/browser-core'

let trackFirstHiddenSingleton: { timeStamp: number } | undefined
let stopListeners: (() => void) | undefined

export function trackFirstHidden(emitter: EventEmitter = window) {
  if (!trackFirstHiddenSingleton) {
    ;({ stop: stopListeners } = addEventListeners(
      emitter,
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

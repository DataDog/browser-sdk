import { addEventListener, DOM_EVENT, EventEmitter } from '@datadog/browser-core'

let trackFirstHiddenSingleton: { timeStamp: number } | undefined
let stopListeners: (() => void) | undefined

export function trackFirstHidden(emitter: EventEmitter = window) {
  if (!trackFirstHiddenSingleton) {
    if (document.visibilityState === 'hidden') {
      trackFirstHiddenSingleton = { timeStamp: 0 }
    } else {
      trackFirstHiddenSingleton = {
        timeStamp: Infinity,
      }
      ;({ stop: stopListeners } = addEventListener(
        emitter,
        DOM_EVENT.PAGE_HIDE,
        ({ timeStamp }) => {
          trackFirstHiddenSingleton!.timeStamp = timeStamp
        },
        { capture: true, once: true }
      ))
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

import { addEventListener, DOM_EVENT, EventEmitter, RelativeTime } from '@datadog/browser-core'

let trackFirstHiddenSingleton: { timeStamp: RelativeTime } | undefined
let stopListeners: (() => void) | undefined

export function trackFirstHidden(emitter: EventEmitter = window) {
  if (!trackFirstHiddenSingleton) {
    if (document.visibilityState === 'hidden') {
      trackFirstHiddenSingleton = { timeStamp: 0 as RelativeTime }
    } else {
      trackFirstHiddenSingleton = {
        timeStamp: Infinity as RelativeTime,
      }
      ;({ stop: stopListeners } = addEventListener(
        emitter,
        DOM_EVENT.PAGE_HIDE,
        ({ timeStamp }) => {
          trackFirstHiddenSingleton!.timeStamp = timeStamp as RelativeTime
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

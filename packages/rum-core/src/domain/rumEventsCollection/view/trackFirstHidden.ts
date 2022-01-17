import type { EventEmitter, RelativeTime } from '@datadog/browser-core'
import { addEventListeners, DOM_EVENT } from '@datadog/browser-core'

let trackFirstHiddenSingleton: { timeStamp: RelativeTime } | undefined
let stopListeners: (() => void) | undefined

export function trackFirstHidden(emitter: EventEmitter = window) {
  if (!trackFirstHiddenSingleton) {
    if (document.visibilityState === 'hidden') {
      trackFirstHiddenSingleton = {
        timeStamp: 0 as RelativeTime,
      }
    } else {
      trackFirstHiddenSingleton = {
        timeStamp: Infinity as RelativeTime,
      }
      ;({ stop: stopListeners } = addEventListeners(
        emitter,
        [DOM_EVENT.PAGE_HIDE, DOM_EVENT.VISIBILITY_CHANGE],
        (event) => {
          if (event.type === 'pagehide' || document.visibilityState === 'hidden') {
            trackFirstHiddenSingleton!.timeStamp = event.timeStamp as RelativeTime
            stopListeners!()
          }
        },
        { capture: true }
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

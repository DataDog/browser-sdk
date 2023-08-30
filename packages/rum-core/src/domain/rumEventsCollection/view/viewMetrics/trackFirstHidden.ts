import type { RelativeTime } from '@datadog/browser-core'
import { addEventListeners, DOM_EVENT } from '@datadog/browser-core'
import type { RumConfiguration } from '../../../configuration'

let trackFirstHiddenSingleton: { timeStamp: RelativeTime; stop: () => void } | undefined

export function trackFirstHidden(configuration: RumConfiguration, eventTarget: Window = window) {
  if (!trackFirstHiddenSingleton) {
    if (document.visibilityState === 'hidden') {
      trackFirstHiddenSingleton = {
        timeStamp: 0 as RelativeTime,
        stop: reset,
      }
    } else {
      trackFirstHiddenSingleton = {
        timeStamp: Infinity as RelativeTime,
        stop: reset,
      }
      const { stop: stopListeners } = addEventListeners(
        configuration,
        eventTarget,
        [DOM_EVENT.PAGE_HIDE, DOM_EVENT.VISIBILITY_CHANGE],
        (event) => {
          if (event.type === 'pagehide' || document.visibilityState === 'hidden') {
            trackFirstHiddenSingleton!.timeStamp = event.timeStamp as RelativeTime
            stopListeners()
          }
        },
        { capture: true }
      )
      trackFirstHiddenSingleton.stop = () => {
        reset()
        stopListeners()
      }
    }
  }

  return trackFirstHiddenSingleton
}

function reset() {
  trackFirstHiddenSingleton = undefined
}

import type { RelativeTime } from '@datadog/browser-core'
import { addEventListeners, DOM_EVENT } from '@datadog/browser-core'
import type { RumConfiguration } from '../../configuration'

export type FirstHidden = ReturnType<typeof trackFirstHidden>

export function trackFirstHidden(configuration: RumConfiguration, eventTarget: Window = window) {
  let timeStamp: RelativeTime
  let stopListeners: () => void | undefined

  if (document.visibilityState === 'hidden') {
    timeStamp = 0 as RelativeTime
  } else {
    timeStamp = Infinity as RelativeTime
    ;({ stop: stopListeners } = addEventListeners(
      configuration,
      eventTarget,
      [DOM_EVENT.PAGE_HIDE, DOM_EVENT.VISIBILITY_CHANGE],
      (event) => {
        if (event.type === DOM_EVENT.PAGE_HIDE || document.visibilityState === 'hidden') {
          timeStamp = event.timeStamp as RelativeTime
          stopListeners()
        }
      },
      { capture: true }
    ))
  }

  return {
    get timeStamp() {
      return timeStamp
    },
    stop() {
      stopListeners?.()
    },
  }
}

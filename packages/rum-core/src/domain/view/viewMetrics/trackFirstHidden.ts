import type { RelativeTime } from '@datadog/browser-core'
import { addEventListeners, DOM_EVENT, noop } from '@datadog/browser-core'
import type { RumConfiguration } from '../../configuration'

export type FirstHidden = ReturnType<typeof trackFirstHidden>

export function trackFirstHidden(configuration: RumConfiguration, eventTarget: Window = window) {
  if (document.visibilityState === 'hidden') {
    return { timeStamp: 0 as RelativeTime, stop: noop }
  }

  let timeStamp: RelativeTime = Infinity as RelativeTime

  const { stop } = addEventListeners(
    configuration,
    eventTarget,
    [DOM_EVENT.PAGE_HIDE, DOM_EVENT.VISIBILITY_CHANGE],
    (event) => {
      if (event.type === DOM_EVENT.PAGE_HIDE || document.visibilityState === 'hidden') {
        timeStamp = event.timeStamp as RelativeTime
        stop()
      }
    },
    { capture: true }
  )

  return {
    get timeStamp() {
      return timeStamp
    },
    stop,
  }
}

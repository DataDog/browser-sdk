import type { RelativeTime } from '@datadog/browser-core'
import { addEventListeners, DOM_EVENT } from '@datadog/browser-core'
import type { RumConfiguration } from '../../configuration'

export type FirstHidden = ReturnType<typeof trackFirstHidden>

export function trackFirstHidden(configuration: RumConfiguration, eventTarget: Window = window) {
  let timeStamp: RelativeTime = Infinity as RelativeTime
  let stopListeners: () => void | undefined
  let earliestHidden = Infinity
  if (typeof performance !== 'undefined' && 'getEntriesByType' in performance) {
    const visibilityEntries = performance.getEntriesByType('visibility-state')
    if (visibilityEntries && visibilityEntries.length > 0) {
      for (const entry of visibilityEntries) {
        if (entry.name === 'hidden') {
          earliestHidden = Math.min(earliestHidden, entry.startTime)
        }
      }
    }
  }
  if (document.visibilityState === 'hidden') {
    timeStamp = 0 as RelativeTime
  } else if (earliestHidden < Infinity) {
    timeStamp = earliestHidden as RelativeTime
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

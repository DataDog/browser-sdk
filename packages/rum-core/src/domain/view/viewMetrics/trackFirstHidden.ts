import type { RelativeTime } from '@datadog/browser-core'
import { addEventListeners, DOM_EVENT, noop } from '@datadog/browser-core'
import type { RumConfiguration } from '../../configuration'
import { supportPerformanceTimingEvent, RumPerformanceEntryType } from '../../../browser/performanceObservable'

export type FirstHidden = ReturnType<typeof trackFirstHidden>
export type Options = {
  initialView?: boolean
}

export function trackFirstHidden(
  configuration: RumConfiguration,
  eventTarget: Window = window,
  { initialView = false }: Options = {}
) {
  if (document.visibilityState === 'hidden') {
    return { timeStamp: 0 as RelativeTime, stop: noop }
  }

  // We only want to check the previous visibility state changes on the initial view where the
  // SDK was still loading.
  if (initialView && supportPerformanceTimingEvent(RumPerformanceEntryType.VISIBILITY_STATE)) {
    const firstHiddenEntry = performance
      .getEntriesByType(RumPerformanceEntryType.VISIBILITY_STATE)
      .find((entry) => entry.name === 'hidden')
    if (firstHiddenEntry) {
      return { timeStamp: firstHiddenEntry.startTime as RelativeTime, stop: noop }
    }
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

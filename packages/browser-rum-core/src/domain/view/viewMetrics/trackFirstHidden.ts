import type { ClocksState, RelativeTime } from '@openobserve/js-core/time'
import { addEventListeners, DOM_EVENT, noop } from '@openobserve/browser-core'
import { supportPerformanceTimingEvent, RumPerformanceEntryType } from '../../../browser/performanceObservable'

export type FirstHidden = ReturnType<typeof trackFirstHidden>

export interface Options {
  viewStart: ClocksState
}

export function trackFirstHidden(viewStart: ClocksState, eventTarget: Window = window) {
  if (document.visibilityState === 'hidden') {
    return { timeStamp: 0 as RelativeTime, stop: noop }
  }

  if (supportPerformanceTimingEvent(RumPerformanceEntryType.VISIBILITY_STATE)) {
    const firstHiddenEntry = performance
      .getEntriesByType(RumPerformanceEntryType.VISIBILITY_STATE)
      .filter((entry) => entry.name === 'hidden')
      .find((entry) => entry.startTime >= viewStart.relative)

    if (firstHiddenEntry) {
      return { timeStamp: firstHiddenEntry.startTime as RelativeTime, stop: noop }
    }
  }

  let timeStamp: RelativeTime = Infinity as RelativeTime

  const { stop } = addEventListeners(
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

import type { Duration, RelativeTime } from '@datadog/browser-core'
import {
  elapsed,
  ValueHistory,
  SESSION_TIME_OUT_DELAY,
  toServerDuration,
  addEventListeners,
  relativeNow,
  DOM_EVENT,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import type { PageStateServerEntry } from '../../rawRumEvent.types'

// Arbitrary value to cap number of element for memory consumption in the browser
export const MAX_PAGE_STATE_ENTRIES = 4000
// Arbitrary value to cap number of element for backend & to save bandwidth
export const MAX_PAGE_STATE_ENTRIES_SELECTABLE = 500

export const PAGE_STATE_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

export const enum PageState {
  ACTIVE = 'active',
  PASSIVE = 'passive',
  HIDDEN = 'hidden',
  FROZEN = 'frozen',
  TERMINATED = 'terminated',
}

export type PageStateEntry = { state: PageState; startTime: RelativeTime }

export interface PageStateHistory {
  findAll: (startTime: RelativeTime, duration: Duration) => PageStateServerEntry[] | undefined
  wasInPageStateAt: (state: PageState, startTime: RelativeTime) => boolean
  wasInPageStateDuringPeriod: (state: PageState, startTime: RelativeTime, duration: Duration) => boolean
  addPageState(nextPageState: PageState, startTime?: RelativeTime): void
  stop: () => void
}

export function startPageStateHistory(
  configuration: RumConfiguration,
  maxPageStateEntriesSelectable = MAX_PAGE_STATE_ENTRIES_SELECTABLE
): PageStateHistory {
  const pageStateEntryHistory = new ValueHistory<PageStateEntry>(
    PAGE_STATE_CONTEXT_TIME_OUT_DELAY,
    MAX_PAGE_STATE_ENTRIES
  )

  let currentPageState: PageState
  addPageState(getPageState(), relativeNow())

  const { stop: stopEventListeners } = addEventListeners(
    configuration,
    window,
    [
      DOM_EVENT.PAGE_SHOW,
      DOM_EVENT.FOCUS,
      DOM_EVENT.BLUR,
      DOM_EVENT.VISIBILITY_CHANGE,
      DOM_EVENT.RESUME,
      DOM_EVENT.FREEZE,
      DOM_EVENT.PAGE_HIDE,
    ],
    (event) => {
      addPageState(computePageState(event), event.timeStamp as RelativeTime)
    },
    { capture: true }
  )

  function addPageState(nextPageState: PageState, startTime = relativeNow()) {
    if (nextPageState === currentPageState) {
      return
    }

    currentPageState = nextPageState
    pageStateEntryHistory.closeActive(startTime)
    pageStateEntryHistory.add({ state: currentPageState, startTime }, startTime)
  }

  const pageStateHistory = {
    findAll: (eventStartTime: RelativeTime, duration: Duration): PageStateServerEntry[] | undefined => {
      const pageStateEntries = pageStateEntryHistory.findAll(eventStartTime, duration)

      if (pageStateEntries.length === 0) {
        return
      }

      const pageStateServerEntries = []
      // limit the number of entries to return
      const limit = Math.max(0, pageStateEntries.length - maxPageStateEntriesSelectable)

      // loop page state entries backward to return the selected ones in desc order
      for (let index = pageStateEntries.length - 1; index >= limit; index--) {
        const pageState = pageStateEntries[index]
        // compute the start time relative to the event start time (ex: to be relative to the view start time)
        const relativeStartTime = elapsed(eventStartTime, pageState.startTime)

        pageStateServerEntries.push({
          state: pageState.state,
          start: toServerDuration(relativeStartTime),
        })
      }

      return pageStateServerEntries
    },
    wasInPageStateAt: (state: PageState, startTime: RelativeTime) =>
      pageStateHistory.wasInPageStateDuringPeriod(state, startTime, 0 as Duration),
    wasInPageStateDuringPeriod: (state: PageState, startTime: RelativeTime, duration: Duration) =>
      pageStateEntryHistory.findAll(startTime, duration).some((pageState) => pageState.state === state),
    addPageState,
    stop: () => {
      stopEventListeners()
      pageStateEntryHistory.stop()
    },
  }
  return pageStateHistory
}

function computePageState(event: Event & { type: DOM_EVENT }) {
  if (event.type === DOM_EVENT.FREEZE) {
    return PageState.FROZEN
  } else if (event.type === DOM_EVENT.PAGE_HIDE) {
    return (event as PageTransitionEvent).persisted ? PageState.FROZEN : PageState.TERMINATED
  }
  return getPageState()
}

function getPageState() {
  if (document.visibilityState === 'hidden') {
    return PageState.HIDDEN
  }

  if (document.hasFocus()) {
    return PageState.ACTIVE
  }

  return PageState.PASSIVE
}

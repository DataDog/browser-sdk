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
  addPageState(nextPageState: PageState, startTime?: RelativeTime): void
  stop: () => void
}

export function startPageStateHistory(
  maxPageStateEntriesSelectable = MAX_PAGE_STATE_ENTRIES_SELECTABLE
): PageStateHistory {
  const pageStateHistory = new ValueHistory<PageStateEntry>(PAGE_STATE_CONTEXT_TIME_OUT_DELAY, MAX_PAGE_STATE_ENTRIES)

  let currentPageState: PageState
  addPageState(getPageState(), relativeNow())

  function addPageState(nextPageState: PageState, startTime = relativeNow()) {
    if (nextPageState === currentPageState) {
      return
    }

    currentPageState = nextPageState
    pageStateHistory.closeActive(startTime)
    pageStateHistory.add({ state: currentPageState, startTime }, startTime)
  }

  const { stop: stopEventListeners } = addEventListeners(
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
      // Only get events fired by the browser to avoid false currentPageState changes done with custom events
      // cf: developer extension auto flush: https://github.com/DataDog/browser-sdk/blob/2f72bf05a672794c9e33965351964382a94c72ba/developer-extension/src/panel/flushEvents.ts#L11-L12
      if (!event.isTrusted) {
        return
      }
      const startTime = event.timeStamp as RelativeTime

      if (event.type === DOM_EVENT.FREEZE) {
        addPageState(PageState.FROZEN, startTime)
      } else if (event.type === DOM_EVENT.PAGE_HIDE) {
        addPageState((event as PageTransitionEvent).persisted ? PageState.FROZEN : PageState.TERMINATED, startTime)
      } else {
        addPageState(getPageState(), startTime)
      }
    },
    { capture: true }
  )

  return {
    findAll: (startTime: RelativeTime, duration: Duration): PageStateServerEntry[] | undefined => {
      const pageStateEntries = pageStateHistory.findAll(startTime, duration)

      if (pageStateEntries.length === 0) {
        return
      }

      const pageStateServerEntries = []
      const limit = Math.max(0, pageStateEntries.length - maxPageStateEntriesSelectable)

      for (let index = pageStateEntries.length - 1; index >= limit; index--) {
        const pageState = pageStateEntries[index]
        const correctedStartTime = startTime > pageState.startTime ? startTime : pageState.startTime
        const recenteredStartTime = elapsed(startTime, correctedStartTime)

        pageStateServerEntries.push({
          state: pageState.state,
          start: toServerDuration(recenteredStartTime),
        })
      }

      return pageStateServerEntries
    },
    addPageState,
    stop: () => {
      stopEventListeners()
      pageStateHistory.stop()
    },
  }
}

export function getPageState() {
  if (document.visibilityState === 'hidden') {
    return PageState.HIDDEN
  }

  if (document.hasFocus()) {
    return PageState.ACTIVE
  }

  return PageState.PASSIVE
}

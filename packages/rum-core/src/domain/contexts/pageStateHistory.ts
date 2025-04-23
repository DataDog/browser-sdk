import type { Duration, RelativeTime } from '@datadog/browser-core'
import {
  elapsed,
  createValueHistory,
  SESSION_TIME_OUT_DELAY,
  toServerDuration,
  addEventListeners,
  relativeNow,
  DOM_EVENT,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import { supportPerformanceTimingEvent, RumPerformanceEntryType } from '../../browser/performanceObservable'
import { RumEventType, type PageStateServerEntry } from '../../rawRumEvent.types'
import { HookNames } from '../../hooks'
import type { Hooks, PartialRumEvent } from '../../hooks'

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
  wasInPageStateDuringPeriod: (state: PageState, startTime: RelativeTime, duration: Duration) => boolean
  addPageState(nextPageState: PageState, startTime?: RelativeTime): void
  stop: () => void
}

export function startPageStateHistory(
  hooks: Hooks,
  configuration: RumConfiguration,
  maxPageStateEntriesSelectable = MAX_PAGE_STATE_ENTRIES_SELECTABLE
): PageStateHistory {
  const pageStateEntryHistory = createValueHistory<PageStateEntry>({
    expireDelay: PAGE_STATE_CONTEXT_TIME_OUT_DELAY,
    maxEntries: MAX_PAGE_STATE_ENTRIES,
  })

  let currentPageState: PageState

  if (supportPerformanceTimingEvent(RumPerformanceEntryType.VISIBILITY_STATE)) {
    const visibilityEntries = performance.getEntriesByType(
      RumPerformanceEntryType.VISIBILITY_STATE
    ) as PerformanceEntry[]

    visibilityEntries.forEach((entry) => {
      const state = entry.name === 'hidden' ? PageState.HIDDEN : PageState.ACTIVE
      addPageState(state, entry.startTime as RelativeTime)
    })
  }

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

  function wasInPageStateDuringPeriod(state: PageState, startTime: RelativeTime, duration: Duration) {
    return pageStateEntryHistory.findAll(startTime, duration).some((pageState) => pageState.state === state)
  }

  hooks.register(
    HookNames.Assemble,
    ({ startTime, duration = 0 as Duration, eventType }): PartialRumEvent | undefined => {
      if (eventType === RumEventType.VIEW) {
        const pageStates = pageStateEntryHistory.findAll(startTime, duration)
        return {
          type: eventType,
          _dd: { page_states: processPageStates(pageStates, startTime, maxPageStateEntriesSelectable) },
        }
      }

      if (eventType === RumEventType.ACTION || eventType === RumEventType.ERROR) {
        return {
          type: eventType,
          view: { in_foreground: wasInPageStateDuringPeriod(PageState.ACTIVE, startTime, 0 as Duration) },
        }
      }
    }
  )

  return {
    wasInPageStateDuringPeriod,
    addPageState,
    stop: () => {
      stopEventListeners()
      pageStateEntryHistory.stop()
    },
  }
}

function processPageStates(
  pageStateEntries: PageStateEntry[],
  eventStartTime: RelativeTime,
  maxPageStateEntriesSelectable: number
): PageStateServerEntry[] | undefined {
  if (pageStateEntries.length === 0) {
    return
  }

  return pageStateEntries
    .slice(-maxPageStateEntriesSelectable)
    .reverse()
    .map(({ state, startTime }) => ({
      state,
      start: toServerDuration(elapsed(eventStartTime, startTime)),
    }))
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

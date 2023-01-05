import type { Duration, RelativeTime } from '@datadog/browser-core'
import {
  isExperimentalFeatureEnabled,
  noop,
  addDuration,
  addEventListeners,
  relativeNow,
  DOM_EVENT,
} from '@datadog/browser-core'

export const MAX_PAGE_STATE_ENTRIES = 500

export const enum PageState {
  ACTIVE = 'active',
  PASSIVE = 'passive',
  HIDDEN = 'hidden',
  FROZEN = 'frozen',
  TERMINATED = 'terminated',
}
export type PageStateEntry = { state: PageState; startTime: RelativeTime }
export interface PageStateHistory {
  findAll: (startTime: RelativeTime, duration: Duration) => PageStateEntry[] | undefined
  stop: () => void
}
let pageStateEntries: PageStateEntry[] = []
let currentPageState: PageState | undefined

export function startPageStateHistory(): PageStateHistory {
  if (!isExperimentalFeatureEnabled('resource_page_states')) {
    return {
      findAll: () => undefined,
      stop: noop,
    }
  }

  addPageState(getPageState())

  const { stop } = addEventListeners(
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

      if (event.type === DOM_EVENT.FREEZE) {
        addPageState(PageState.FROZEN)
      } else if (event.type === DOM_EVENT.PAGE_HIDE) {
        addPageState((event as PageTransitionEvent).persisted ? PageState.FROZEN : PageState.TERMINATED)
      } else {
        addPageState(getPageState())
      }
    },
    { capture: true }
  )

  return {
    findAll(startTime: RelativeTime, duration: Duration) {
      const entries: PageStateEntry[] = []
      const endTime = addDuration(startTime, duration)
      for (let i = pageStateEntries.length - 1; i >= 0; i--) {
        const { startTime: stateStartTime } = pageStateEntries[i]

        if (stateStartTime >= endTime) {
          continue
        }

        entries.unshift(pageStateEntries[i])

        if (stateStartTime < startTime) {
          break
        }
      }

      return entries.length ? entries : undefined
    },
    stop,
  }
}

function getPageState(): PageState {
  if (document.visibilityState === 'hidden') {
    return PageState.HIDDEN
  }
  if (document.hasFocus()) {
    return PageState.ACTIVE
  }
  return PageState.PASSIVE
}

export function addPageState(nextPageState: PageState, maxPageStateEntries = MAX_PAGE_STATE_ENTRIES) {
  if (nextPageState === currentPageState) {
    return
  }

  currentPageState = nextPageState

  if (pageStateEntries.length === maxPageStateEntries) {
    pageStateEntries.shift()
  }

  pageStateEntries.push({ state: currentPageState, startTime: relativeNow() })
}

export function resetPageStates() {
  pageStateEntries = []
  currentPageState = undefined
}

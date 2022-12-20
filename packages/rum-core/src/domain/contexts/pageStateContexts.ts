import type { Duration, RelativeTime } from '@datadog/browser-core'
import {
  isExperimentalFeatureEnabled,
  noop,
  elapsed,
  addDuration,
  addEventListeners,
  relativeNow,
  DOM_EVENT,
} from '@datadog/browser-core'

export const PAGE_STATE_TIMELINE_MAX_LENGTH = 2500

export const enum PageState {
  ACTIVE = 'active',
  PASSIVE = 'passive',
  HIDDEN = 'hidden',
  FROZEN = 'frozen',
  TERMINATED = 'terminated',
}

type PageStateTimeline = Array<{ state: PageState; startTime: RelativeTime }>

type Counter = { count: number; duration: Duration }
export type PageStateContext = {
  active: Counter
  passive: Counter
  hidden: Counter
  frozen: Counter
  terminated: Counter
}

export interface PageStateContexts {
  getPageStates: (startTime: RelativeTime, duration: Duration) => PageStateContext | undefined
  stop: () => void
}

let pageStateTimeline: PageStateTimeline = []
let state: PageState | undefined

export function startPageStateContexts(): PageStateContexts {
  if (!isExperimentalFeatureEnabled('resource_page_states')) {
    return {
      getPageStates: () => undefined,
      stop: noop,
    }
  }

  addPageState(getState())

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
      if (!event.isTrusted) return

      if (event.type === DOM_EVENT.FREEZE) addPageState(PageState.FROZEN)
      else if (event.type === DOM_EVENT.PAGE_HIDE)
        addPageState((event as PageTransitionEvent).persisted ? PageState.FROZEN : PageState.TERMINATED)
      else addPageState(getState())
    },
    { capture: true }
  )

  function findStartIndex(startTime: RelativeTime) {
    let i = pageStateTimeline.length - 1
    while (i >= 0 && pageStateTimeline[i].startTime > startTime) {
      i--
    }

    return i >= 0 ? i : 0
  }

  return {
    getPageStates(startTime: RelativeTime, duration: Duration) {
      const endTime = addDuration(startTime, duration)
      if (pageStateTimeline.length === 0 || pageStateTimeline[0].startTime >= endTime) return

      const pageStateContext: PageStateContext = {
        active: { count: 0, duration: 0 as Duration },
        passive: { count: 0, duration: 0 as Duration },
        hidden: { count: 0, duration: 0 as Duration },
        frozen: { count: 0, duration: 0 as Duration },
        terminated: { count: 0, duration: 0 as Duration },
      }

      for (
        let i = findStartIndex(startTime);
        i < pageStateTimeline.length && pageStateTimeline[i].startTime < endTime;
        i++
      ) {
        const curr = pageStateTimeline[i]
        const next =
          i + 1 < pageStateTimeline.length ? pageStateTimeline[i + 1] : { startTime: Infinity as RelativeTime }

        const start = startTime > curr.startTime ? startTime : curr.startTime
        const end = endTime < next.startTime ? endTime : next.startTime

        pageStateContext[curr.state].duration = addDuration(pageStateContext[curr.state].duration, elapsed(start, end))
        pageStateContext[curr.state].count++
      }

      return pageStateContext
    },
    stop,
  }
}

export function getState(): PageState {
  if (document.visibilityState === 'hidden') {
    return PageState.HIDDEN
  }
  if (document.hasFocus()) {
    return PageState.ACTIVE
  }
  return PageState.PASSIVE
}

export function addPageState(nextState: PageState, pageStateTimelineMaxLength = PAGE_STATE_TIMELINE_MAX_LENGTH) {
  if (nextState === state) return

  state = nextState
  const now = relativeNow()

  if (pageStateTimeline.length === pageStateTimelineMaxLength) pageStateTimeline.shift()

  pageStateTimeline.push({ state, startTime: now })
}

export function resetPageStates() {
  pageStateTimeline = []
  state = undefined
}

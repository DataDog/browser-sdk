import type { Duration, RelativeTime } from '@datadog/browser-core'
import {
  isExperimentalFeatureEnabled,
  noop,
  elapsed,
  addDuration,
  addEventListeners,
  addEventListener,
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

  const listenerOpts = { capture: true }
  const stoppers: Array<{ stop: () => void }> = []

  stoppers.push(
    addEventListeners(
      window,
      [DOM_EVENT.PAGE_SHOW, DOM_EVENT.FOCUS, DOM_EVENT.BLUR, DOM_EVENT.VISIBILITY_CHANGE, DOM_EVENT.RESUME],
      (ev) => {
        if (ev.isTrusted) addPageState(getState())
      },
      listenerOpts
    ),
    addEventListener(
      window,
      DOM_EVENT.FREEZE,
      (ev) => {
        if (ev.isTrusted) addPageState(PageState.FROZEN)
      },
      listenerOpts
    ),
    addEventListener(
      window,
      DOM_EVENT.PAGE_HIDE,
      (ev: PageTransitionEvent) => {
        // If the event's persisted property is `true` the page is about
        // to enter the back/forward cache, which is also in the frozen state.
        // If the event's persisted property is not `true` the page is
        // about to be unloaded.
        if (ev.isTrusted) addPageState(ev.persisted ? PageState.FROZEN : PageState.TERMINATED)
      },
      listenerOpts
    )
  )

  function findStartIndex(startTime: RelativeTime) {
    let i = -1
    let endTime

    do {
      i++
      endTime = i + 1 < pageStateTimeline.length ? pageStateTimeline[i + 1].startTime : Infinity
    } while (i < pageStateTimeline.length && endTime <= startTime)

    return i
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

      let i = findStartIndex(startTime)
      while (i < pageStateTimeline.length && pageStateTimeline[i].startTime < endTime) {
        const curr = pageStateTimeline[i]
        const next =
          i + 1 < pageStateTimeline.length ? pageStateTimeline[i + 1] : { startTime: Infinity as RelativeTime }

        const start = startTime > curr.startTime ? startTime : curr.startTime
        const end = endTime < next.startTime ? endTime : next.startTime

        pageStateContext[curr.state].duration = addDuration(pageStateContext[curr.state].duration, elapsed(start, end))
        pageStateContext[curr.state].count++
        i++
      }

      return pageStateContext
    },
    stop() {
      stoppers.forEach((stopper) => stopper.stop())
    },
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

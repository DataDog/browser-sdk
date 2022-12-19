import type { RelativeTime } from '@datadog/browser-core'
import { addEventListeners, addEventListener, relativeNow, DOM_EVENT } from '@datadog/browser-core'

export const enum PageState {
  ACTIVE = 'active',
  PASSIVE = 'passive',
  HIDDEN = 'hidden',
  FROZEN = 'frozen',
  TERMINATED = 'terminated',
}

type PageStateTimeline = Array<{ state?: PageState; startTime: RelativeTime }>

type Counter = { count: number; duration: number }
type PageStateInfo = {
  active: Counter
  passive: Counter
  hidden: Counter
  frozen: Counter
  terminated: Counter
}

export interface PageStateContexts {
  getPageStates: (startTime?: RelativeTime, endTime?: RelativeTime) => PageStateInfo
}

const pageStateTimeline: PageStateTimeline = []

export function startPageStateContexts(): PageStateContexts {
  let state = getState()
  // console.log('first state', state)
  logStateChange(state)

  function logStateChange(nextState: PageState) {
    // console.log('logStateChange', state, nextState)

    if (nextState !== state) {
      state = nextState
      // console.log('after logStateChange')

      pageStateTimeline.push({ state, startTime: relativeNow() })
    }
  }

  const listenerOpts = { capture: true }

  addEventListeners(
    window,
    [DOM_EVENT.PAGE_SHOW, DOM_EVENT.FOCUS, DOM_EVENT.BLUR, DOM_EVENT.VISIBILITY_CHANGE, DOM_EVENT.RESUME],
    () => logStateChange(getState()),
    listenerOpts
  )

  addEventListener(window, DOM_EVENT.FREEZE, () => logStateChange(PageState.FROZEN), listenerOpts)

  addEventListener(
    window,
    DOM_EVENT.PAGE_HIDE,
    (event: PageTransitionEvent) => {
      // If the event's persisted property is `true` the page is about
      // to enter the back/forward cache, which is also in the frozen state.
      // If the event's persisted property is not `true` the page is
      // about to be unloaded.
      logStateChange(event.persisted ? PageState.FROZEN : PageState.TERMINATED)
    },
    listenerOpts
  )

  function getTimeline(startTime: RelativeTime, endTime: RelativeTime) {
    const start = pageStateTimeline.findIndex((state) => state.startTime < startTime)

    if (start === -1) {
      return []
    }

    let end = pageStateTimeline.length - 1

    while (pageStateTimeline[end].startTime > endTime) end--

    return pageStateTimeline.slice(start, end + 1)
  }

  return {
    getPageStates(startTime: RelativeTime = 0 as RelativeTime, endTime: RelativeTime = Infinity as RelativeTime) {
      const stateDurations = {
        active: { count: 0, duration: 0 },
        passive: { count: 0, duration: 0 },
        hidden: { count: 0, duration: 0 },
        frozen: { count: 0, duration: 0 },
        terminated: { count: 0, duration: 0 },
      }

      const timeline = getTimeline(startTime, endTime)

      if (!timeline.length) return stateDurations

      timeline.push({ startTime: endTime, state: undefined as any })

      for (let i = 0; i < timeline.length - 1; i++) {
        const first = timeline[i]
        const second = timeline[i + 1]
        const start = startTime > first.startTime ? startTime : first.startTime
        const end = endTime < second.startTime ? endTime : second.startTime

        stateDurations[first.state!].duration += end - start
        stateDurations[first.state!].count++
      }

      return stateDurations
    },
  }
}

function getState(): PageState {
  if (document.visibilityState === 'hidden') {
    return PageState.HIDDEN
  }
  if (document.hasFocus()) {
    return PageState.ACTIVE
  }
  return PageState.PASSIVE
}

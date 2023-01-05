import type { Duration, RelativeTime } from '@datadog/browser-core'
import {
  isExperimentalFeatureEnabled,
  noop,
  addDuration,
  addEventListeners,
  relativeNow,
  DOM_EVENT,
} from '@datadog/browser-core'

export const PAGE_STATE_CONTEXT_MAX_LENGTH = 500

export const enum PageState {
  ACTIVE = 'active',
  PASSIVE = 'passive',
  HIDDEN = 'hidden',
  FROZEN = 'frozen',
  TERMINATED = 'terminated',
}

export type PageStateContext = Array<{ state: PageState; startTime: RelativeTime }>

export interface PageStateContexts {
  getPageStates: (startTime: RelativeTime, duration: Duration) => PageStateContext | undefined
  stop: () => void
}

let pageStateContext: PageStateContext = []
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
      // Only get events fired by the browser to avoid false state changes done with custom events
      // cf: developer extension auto flush: https://github.com/DataDog/browser-sdk/blob/2f72bf05a672794c9e33965351964382a94c72ba/developer-extension/src/panel/flushEvents.ts#L11-L12
      if (!event.isTrusted) {
        return
      }

      if (event.type === DOM_EVENT.FREEZE) {
        addPageState(PageState.FROZEN)
      } else if (event.type === DOM_EVENT.PAGE_HIDE) {
        addPageState((event as PageTransitionEvent).persisted ? PageState.FROZEN : PageState.TERMINATED)
      } else {
        addPageState(getState())
      }
    },
    { capture: true }
  )

  return {
    getPageStates(startTime: RelativeTime, duration: Duration) {
      const context: PageStateContext = []
      const endTime = addDuration(startTime, duration)
      for (let i = pageStateContext.length - 1; i >= 0; i--) {
        const { startTime: stateStartTime } = pageStateContext[i]

        if (stateStartTime >= endTime) {
          continue
        }

        context.unshift(pageStateContext[i])

        if (stateStartTime < startTime) {
          break
        }
      }

      return context.length ? context : undefined
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

export function addPageState(nextState: PageState, pageStateContextMaxLength = PAGE_STATE_CONTEXT_MAX_LENGTH) {
  if (nextState === state) {
    return
  }

  state = nextState
  const now = relativeNow()

  if (pageStateContext.length === pageStateContextMaxLength) {
    pageStateContext.shift()
  }

  pageStateContext.push({ state, startTime: now })
}

export function resetPageStates() {
  pageStateContext = []
  state = undefined
}

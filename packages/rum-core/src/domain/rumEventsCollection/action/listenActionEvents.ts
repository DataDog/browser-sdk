import type { TimeStamp } from '@datadog/browser-core'
import { addEventListener, DOM_EVENT, isExperimentalFeatureEnabled, timeStampNow } from '@datadog/browser-core'

export type MouseEventOnElement = MouseEvent & { target: Element }

export interface UserActivity {
  selection: boolean
  input: boolean
}
export interface ActionEventsHooks<ClickContext> {
  onPointerDown: (event: MouseEventOnElement) => ClickContext | undefined
  onStartEvent: (
    context: ClickContext,
    event: MouseEventOnElement,
    getUserActivity: () => UserActivity,
    getClickEventTimeStamp: () => TimeStamp | undefined
  ) => void
}

export function listenActionEvents<ClickContext>({ onPointerDown, onStartEvent }: ActionEventsHooks<ClickContext>) {
  let selectionEmptyAtPointerDown: boolean
  let userActivity: UserActivity = {
    selection: false,
    input: false,
  }
  let clickContext: ClickContext | undefined

  const listeners = [
    addEventListener(
      window,
      DOM_EVENT.POINTER_DOWN,
      (event: PointerEvent) => {
        if (isValidMouseEvent(event)) {
          selectionEmptyAtPointerDown = isSelectionEmpty()
          userActivity = {
            selection: false,
            input: isExperimentalFeatureEnabled('dead_click_fixes')
              ? false
              : // Mimics the issue that was fixed in https://github.com/DataDog/browser-sdk/pull/1968
                // The goal is to release all dead click fixes at the same time
                userActivity.input,
          }
          clickContext = onPointerDown(event)
        }
      },
      { capture: true }
    ),

    addEventListener(
      window,
      DOM_EVENT.SELECTION_CHANGE,
      () => {
        if (!selectionEmptyAtPointerDown || !isSelectionEmpty()) {
          userActivity.selection = true
        }
      },
      { capture: true }
    ),

    addEventListener(
      window,
      isExperimentalFeatureEnabled('dead_click_fixes') ? DOM_EVENT.POINTER_UP : DOM_EVENT.CLICK,
      (startEvent: MouseEvent) => {
        if (isValidMouseEvent(startEvent) && clickContext) {
          // Use a scoped variable to make sure the value is not changed by other clicks
          const localUserActivity = userActivity
          let clickEventTimeStamp: TimeStamp | undefined
          onStartEvent(
            clickContext,
            startEvent,
            () => localUserActivity,
            () => clickEventTimeStamp
          )
          clickContext = undefined
          if (isExperimentalFeatureEnabled('dead_click_fixes')) {
            addEventListener(
              window,
              DOM_EVENT.CLICK,
              () => {
                clickEventTimeStamp = timeStampNow()
              },
              { capture: true, once: true }
            )
          }
        }
      },
      { capture: true }
    ),

    addEventListener(
      window,
      DOM_EVENT.INPUT,
      () => {
        userActivity.input = true
      },
      { capture: true }
    ),
  ]

  return {
    stop: () => {
      listeners.forEach((listener) => listener.stop())
    },
  }
}

function isSelectionEmpty(): boolean {
  const selection = window.getSelection()
  return !selection || selection.isCollapsed
}

function isValidMouseEvent(event: MouseEvent): event is MouseEventOnElement {
  return (
    event.target instanceof Element &&
    // Only consider 'primary' pointer events for now. Multi-touch support could be implemented in
    // the future.
    // On Chrome, click events are PointerEvent with `isPrimary = false`, but we should still
    // consider them valid. This could be removed when we enable the `click-action-on-pointerup`
    // flag, since we won't rely on click events anymore.
    (event.type === 'click' || (event as PointerEvent).isPrimary !== false)
  )
}

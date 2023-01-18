import { addEventListener, DOM_EVENT } from '@datadog/browser-core'

export type MouseEventOnElement = MouseEvent & { target: Element }

export interface UserActivity {
  selection: boolean
  input: boolean
}
export interface ActionEventsHooks<ClickContext> {
  onPointerDown: (event: MouseEventOnElement) => ClickContext | undefined
  onClick: (context: ClickContext, event: MouseEventOnElement, getUserActivity: () => UserActivity) => void
}

export function listenActionEvents<ClickContext>({ onPointerDown, onClick }: ActionEventsHooks<ClickContext>) {
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
            input: false,
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
      DOM_EVENT.CLICK,
      (clickEvent: MouseEvent) => {
        if (isValidMouseEvent(clickEvent) && clickContext) {
          // Use a scoped variable to make sure the value is not changed by other clicks
          const localUserActivity = userActivity
          onClick(clickContext, clickEvent, () => localUserActivity)
          clickContext = undefined
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

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
      (event) => {
        selectionEmptyAtPointerDown = isSelectionEmpty()
        userActivity = {
          selection: false,
          input: false,
        }
        if (isMouseEventOnElement(event)) {
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
        if (isMouseEventOnElement(clickEvent) && clickContext) {
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

function isMouseEventOnElement(event: Event): event is MouseEventOnElement {
  return event.target instanceof Element
}

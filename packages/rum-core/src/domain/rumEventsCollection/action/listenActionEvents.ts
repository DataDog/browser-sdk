import { addEventListener, DOM_EVENT, monitor } from '@datadog/browser-core'

export type MouseEventOnElement = MouseEvent & { target: Element }

export type GetUserActivity = () => { selection: boolean; input: boolean }
export interface ActionEventsHooks<ClickContext> {
  onPointerDown: (event: MouseEventOnElement) => ClickContext | undefined
  onClick: (context: ClickContext, event: MouseEventOnElement, getUserActivity: GetUserActivity) => void
}

export function listenActionEvents<ClickContext>({ onPointerDown, onClick }: ActionEventsHooks<ClickContext>) {
  let hasSelectionChanged = false
  let selectionEmptyAtPointerDown: boolean
  let hasInputChanged = false
  let clickContext: ClickContext | undefined

  const listeners = [
    addEventListener(
      window,
      DOM_EVENT.POINTER_DOWN,
      (event) => {
        hasSelectionChanged = false
        selectionEmptyAtPointerDown = isSelectionEmpty()
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
          hasSelectionChanged = true
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
          const userActivity = {
            selection: hasSelectionChanged,
            input: hasInputChanged,
          }
          if (!hasInputChanged) {
            setTimeout(
              monitor(() => {
                userActivity.input = hasInputChanged
              })
            )
          }

          onClick(clickContext, clickEvent, () => userActivity)
          clickContext = undefined
        }
      },
      { capture: true }
    ),

    addEventListener(
      window,
      DOM_EVENT.INPUT,
      () => {
        hasInputChanged = true
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

import { addEventListener, DOM_EVENT, monitor } from '@datadog/browser-core'

export type MouseEventOnElement = MouseEvent & { target: Element }

export type OnPointerDownCallback = (event: MouseEventOnElement) => { onClick: OnClickCallback } | undefined
export type OnClickCallback = (context: OnClickContext) => void
export interface OnClickContext {
  event: MouseEventOnElement
  getUserActivity(): { selection: boolean; input: boolean }
}

export function listenActionEvents({ onPointerDown }: { onPointerDown: OnPointerDownCallback }) {
  let hasSelectionChanged = false
  let selectionEmptyAtPointerDown: boolean
  let hasInputChanged = false
  let onClick: ((context: OnClickContext) => void) | undefined

  const listeners = [
    addEventListener(
      window,
      DOM_EVENT.POINTER_DOWN,
      (event) => {
        hasSelectionChanged = false
        selectionEmptyAtPointerDown = isSelectionEmpty()
        if (isMouseEventOnElement(event)) {
          onClick = onPointerDown(event)?.onClick
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
        if (isMouseEventOnElement(clickEvent) && onClick) {
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

          onClick({
            event: clickEvent,
            getUserActivity: () => userActivity,
          })
          onClick = undefined
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

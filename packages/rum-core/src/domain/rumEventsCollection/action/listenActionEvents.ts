import { addEventListener, DOM_EVENT } from '@datadog/browser-core'

export interface OnClickContext {
  event: MouseEvent & { target: Element }
  getUserActivity(): { selection: boolean }
}

export function listenActionEvents({ onClick }: { onClick(context: OnClickContext): void }) {
  let hasSelectionChanged = false
  let selectionEmptyAtMouseDown: boolean

  const listeners = [
    addEventListener(
      window,
      DOM_EVENT.MOUSE_DOWN,
      () => {
        hasSelectionChanged = false
        selectionEmptyAtMouseDown = isSelectionEmpty()
      },
      { capture: true }
    ),

    addEventListener(
      window,
      DOM_EVENT.SELECTION_CHANGE,
      () => {
        if (!selectionEmptyAtMouseDown || !isSelectionEmpty()) {
          hasSelectionChanged = true
        }
      },
      { capture: true }
    ),

    addEventListener(
      window,
      DOM_EVENT.CLICK,
      (clickEvent: MouseEvent) => {
        if (clickEvent.target instanceof Element) {
          // Use a scoped variable to make sure the value is not changed by other clicks
          const userActivity = { selection: hasSelectionChanged }

          onClick({
            event: clickEvent as MouseEvent & { target: Element },
            getUserActivity: () => userActivity,
          })
        }
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

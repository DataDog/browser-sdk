import { addEventListener, DOM_EVENT } from '@datadog/browser-core'

export type OnClickCallback = (clickEvent: MouseEvent & { target: Element }, hasSelectionChanged: boolean) => void

export function listenEvents({ onClick }: { onClick: OnClickCallback }) {
  let hasSelectionChanged = false
  let selectionEmptyAtMouseDown: boolean

  const { stop: stopMouseDownListener } = addEventListener(
    window,
    DOM_EVENT.MOUSE_DOWN,
    () => {
      hasSelectionChanged = false
      selectionEmptyAtMouseDown = isSelectionEmpty()
    },
    { capture: true }
  )

  const { stop: stopSelectionChangeListener } = addEventListener(
    window,
    DOM_EVENT.SELECTION_CHANGE,
    () => {
      if (selectionEmptyAtMouseDown !== isSelectionEmpty()) {
        hasSelectionChanged = true
      }
    },
    { capture: true }
  )

  const { stop: stopClickListener } = addEventListener(
    window,
    DOM_EVENT.CLICK,
    (clickEvent: MouseEvent) => {
      if (clickEvent.target instanceof Element) {
        onClick(clickEvent as MouseEvent & { target: Element }, hasSelectionChanged)
      }
    },
    { capture: true }
  )

  return {
    stop: () => {
      stopMouseDownListener()
      stopSelectionChangeListener()
      stopClickListener()
    },
  }
}

function isSelectionEmpty(): boolean {
  const selection = window.getSelection()
  return !selection || selection.isCollapsed
}

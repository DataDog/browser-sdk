import { DOM_EVENT, addEventListener } from '@datadog/browser-core'

export function trackSelectionChange() {
  let selectionChanged = false

  const { stop: stopMouseDownListener } = addEventListener(
    window,
    DOM_EVENT.MOUSE_DOWN,
    () => {
      selectionChanged = false
    },
    { capture: true }
  )

  const { stop: stopSelectionChangeListener } = addEventListener(
    window,
    DOM_EVENT.SELECTION_CHANGE,
    () => {
      const selection = window.getSelection()!
      if (selection && !selection.isCollapsed) {
        selectionChanged = true
      }
    },
    { capture: true }
  )

  return {
    /**
     * Use this function during events following "mousedown" (ex: "mouseup" or "click") to get
     * whether the selection just changed.
     */
    getSelectionChanged: () => selectionChanged,
    stop: () => {
      stopSelectionChangeListener()
      stopMouseDownListener()
    },
  }
}

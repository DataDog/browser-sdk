import { DOM_EVENT, addEventListener } from '@datadog/browser-core'

export function trackSelectionChange() {
  let selectionChanged = false
  let hadEmptyWindowSelection = true

  const { stop: stopMouseDownListener } = addEventListener(
    window,
    DOM_EVENT.MOUSE_DOWN,
    () => {
      selectionChanged = false
      hadEmptyWindowSelection = hasEmptyWindowSelection()
    },
    { capture: true }
  )

  // Capture selection change. This event is triggered when the window selection changes
  // (occurring across multiple DOM elements) or when the selection inside a text input / textarea
  // element changes)
  const { stop: stopSelectionChangeListener } = addEventListener(
    window,
    DOM_EVENT.SELECTION_CHANGE,
    () => {
      if (
        // We want to consider any text input selection change, even empty ones because it could
        // be a caret move that should not be considered as a dead click
        hasTextInputSelection() ||
        // but we don't want the same behavior for window selection: ignore the case where the
        // window selection changed but stayed empty
        !(hadEmptyWindowSelection && hasEmptyWindowSelection())
      ) {
        selectionChanged = true
      }
    },
    { capture: true }
  )

  return {
    /**
     * Use this function during a "click" event to get whether the selection just changed.
     */
    getSelectionChanged: () => selectionChanged,
    stop: () => {
      stopSelectionChangeListener()
      stopMouseDownListener()
    },
  }
}

function hasTextInputSelection() {
  const activeElement = document.activeElement
  return (
    (activeElement instanceof HTMLInputElement && activeElement.selectionStart !== null) ||
    activeElement instanceof HTMLTextAreaElement
  )
}

function hasEmptyWindowSelection() {
  const selection = window.getSelection()!
  return !selection || selection.isCollapsed
}

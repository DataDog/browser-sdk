import { addEventListener, DOM_EVENT } from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'

export type MouseEventOnElement = PointerEvent & { target: Element }

export interface UserActivity {
  selection: boolean
  input: boolean
  scroll: boolean
}
export interface ActionEventsHooks<ClickContext> {
  onPointerDown: (event: MouseEventOnElement) => ClickContext | undefined
  onPointerUp: (context: ClickContext, event: MouseEventOnElement, getUserActivity: () => UserActivity) => void
}

export function listenActionEvents<ClickContext>(
  configuration: RumConfiguration,
  { onPointerDown, onPointerUp }: ActionEventsHooks<ClickContext>
) {
  let selectionEmptyAtPointerDown: boolean
  let userActivity: UserActivity = {
    selection: false,
    input: false,
    scroll: false,
  }
  let clickContext: ClickContext | undefined

  const listeners = [
    addEventListener(
      configuration,
      window,
      DOM_EVENT.POINTER_DOWN,
      (event: PointerEvent) => {
        if (isValidPointerEvent(event)) {
          selectionEmptyAtPointerDown = isSelectionEmpty()
          userActivity = {
            selection: false,
            input: false,
            scroll: false,
          }
          clickContext = onPointerDown(event)
        }
      },
      { capture: true }
    ),

    addEventListener(
      configuration,
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
      configuration,
      window,
      DOM_EVENT.SCROLL,
      () => {
        userActivity.scroll = true
      },
      { capture: true, passive: true }
    ),

    addEventListener(
      configuration,
      window,
      DOM_EVENT.POINTER_UP,
      (event: PointerEvent) => {
        if (isValidPointerEvent(event) && clickContext) {
          // Use a scoped variable to make sure the value is not changed by other clicks
          const localUserActivity = userActivity
          onPointerUp(clickContext, event, () => localUserActivity)
          clickContext = undefined
        }
      },
      { capture: true }
    ),

    addEventListener(
      configuration,
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

function isValidPointerEvent(event: PointerEvent): event is MouseEventOnElement {
  return (
    event.target instanceof Element &&
    // Only consider 'primary' pointer events for now. Multi-touch support could be implemented in
    // the future.
    event.isPrimary !== false
  )
}

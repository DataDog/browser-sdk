import { addEventListener, DOM_EVENT } from '@datadog/browser-core'
import type { RelativeTime } from '@datadog/js-core/time'

export interface ExtraPointerEventFields {
  target: Element
  timeStamp: RelativeTime
}
export type MouseEventOnElement = PointerEvent & ExtraPointerEventFields

export interface UserActivity {
  selection: boolean
  input: boolean
  scroll: boolean
}
export interface ActionEventsHooks<ClickContext> {
  onPointerDown: (event: MouseEventOnElement) => ClickContext | undefined
  onPointerUp: (context: ClickContext, event: MouseEventOnElement, getUserActivity: () => UserActivity) => void
}

/**
 * Maximum distance (in CSS pixels) a touch/pen pointer may travel between pointerdown and
 * pointerup while still being considered a click. Beyond this, the gesture is a scroll/drag and
 * is not recorded as a click action.
 *
 * A touch that scrolls the page moves the finger noticeably (tens to hundreds of pixels), while a
 * genuine tap barely moves. This threshold sits just above the platform touch slop (~8px, the
 * distance at which the browser itself starts treating a touch as a scroll and stops firing its
 * synthetic `click` event), leaving a small margin for the natural jitter of a real tap.
 */
export const ACTION_SCROLL_DISTANCE_THRESHOLD = 10

export function listenActionEvents<ClickContext>({ onPointerDown, onPointerUp }: ActionEventsHooks<ClickContext>) {
  let selectionEmptyAtPointerDown: boolean
  let userActivity: UserActivity = {
    selection: false,
    input: false,
    scroll: false,
  }
  let clickContext: ClickContext | undefined
  let pointerDownEvent: MouseEventOnElement | undefined

  const listeners = [
    addEventListener(
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
          pointerDownEvent = event
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
      DOM_EVENT.SCROLL,
      () => {
        userActivity.scroll = true
      },
      { capture: true, passive: true }
    ),

    addEventListener(
      window,
      DOM_EVENT.POINTER_UP,
      (event: PointerEvent) => {
        if (isValidPointerEvent(event) && clickContext) {
          if (isScrollGesture(pointerDownEvent, event)) {
            // The pointer moved like a scroll/drag rather than a tap, so this is not a click.
            // This notably happens in Android WebViews: when the native layer handles the scroll,
            // the page receives pointerdown -> pointerup (no `pointercancel`, no synthetic `click`)
            // even though the finger moved. Recording it would create a spurious click action.
            clickContext = undefined
            return
          }
          // Use a scoped variable to make sure the value is not changed by other clicks
          const localUserActivity = userActivity
          onPointerUp(clickContext, event, () => localUserActivity)
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

function isValidPointerEvent(event: PointerEvent): event is MouseEventOnElement {
  return (
    event.target instanceof Element &&
    // Only consider 'primary' pointer events for now. Multi-touch support could be implemented in
    // the future.
    event.isPrimary !== false
  )
}

/**
 * Tells whether a pointerdown -> pointerup sequence is a scroll/drag rather than a click, based on
 * how far the pointer travelled. Only applies to touch and pen pointers: mouse clicks (which do not
 * scroll the page) keep their existing behavior.
 */
function isScrollGesture(pointerDownEvent: MouseEventOnElement | undefined, pointerUpEvent: MouseEventOnElement) {
  if (!pointerDownEvent || pointerUpEvent.pointerType === 'mouse') {
    return false
  }
  const deltaX = pointerUpEvent.clientX - pointerDownEvent.clientX
  const deltaY = pointerUpEvent.clientY - pointerDownEvent.clientY
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY) > ACTION_SCROLL_DISTANCE_THRESHOLD
}

import { addEventListener, clearTimeout, DOM_EVENT, setTimeout } from '@datadog/browser-core'
import type { TimeoutId } from '@datadog/browser-core'
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

/**
 * When a touch/pen pointer moves beyond ACTION_SCROLL_DISTANCE_THRESHOLD, the action is not dropped
 * immediately: it is held for this long to see whether the browser fires a corroborating `click`.
 * A genuine tap fires `click` right after `pointerup` even if the finger wobbled past the movement
 * threshold, so a corroborated gesture is kept; a real scroll/drag never fires `click`, so it is
 * dropped once this delay elapses. This makes the guard robust to devices whose tap slop exceeds our
 * movement threshold (see docs/specs §9, §11) — we never discard a browser-confirmed click.
 */
export const CLICK_CORROBORATION_TIMEOUT = 50

export function listenActionEvents<ClickContext>({ onPointerDown, onPointerUp }: ActionEventsHooks<ClickContext>) {
  let selectionEmptyAtPointerDown: boolean
  let userActivity: UserActivity = {
    selection: false,
    input: false,
    scroll: false,
  }
  let clickContext: ClickContext | undefined
  let pointerDownEvent: MouseEventOnElement | undefined
  // A moved pointerup awaiting a corroborating `click` before it is emitted or dropped.
  let pendingScrollCandidate: { emit: () => void; timeoutId: TimeoutId } | undefined

  function dropPendingScrollCandidate() {
    if (pendingScrollCandidate) {
      clearTimeout(pendingScrollCandidate.timeoutId)
      pendingScrollCandidate = undefined
    }
  }

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
          // Use a scoped variable to make sure the value is not changed by other clicks
          const localUserActivity = userActivity
          const context = clickContext
          clickContext = undefined
          const emit = () => onPointerUp(context, event, () => localUserActivity)

          if (isScrollGesture(pointerDownEvent, event)) {
            // The pointer moved like a scroll/drag rather than a tap. This notably happens in
            // Android WebViews / iOS WKWebViews: when the native layer handles the scroll, the page
            // receives pointerdown -> pointerup (no `pointercancel`) even though the finger moved.
            // Instead of dropping it outright, hold it briefly: if the browser fires a corroborating
            // `click`, it really was a tap (the movement threshold was too tight for this device),
            // so keep it. A real scroll never fires `click`, so it is dropped on timeout.
            dropPendingScrollCandidate()
            pendingScrollCandidate = {
              emit,
              timeoutId: setTimeout(dropPendingScrollCandidate, CLICK_CORROBORATION_TIMEOUT),
            }
            return
          }
          emit()
        }
      },
      { capture: true }
    ),

    addEventListener(
      window,
      DOM_EVENT.CLICK,
      () => {
        // A `click` after a moved pointerup proves the browser considered it a tap: keep it.
        if (pendingScrollCandidate) {
          const { emit } = pendingScrollCandidate
          dropPendingScrollCandidate()
          emit()
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
      dropPendingScrollCandidate()
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

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
  // Whether the page took over the gesture by calling preventDefault on a touchmove. When it does,
  // the browser does not scroll, so it delivers pointerup even for a moved pointer — a legitimate
  // drag interaction (custom scroller) that the SDK records today and must keep recording.
  let pageHandledTouchMove = false

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
          pageHandledTouchMove = false
          pointerDownEvent = event
          clickContext = onPointerDown(event)
        }
      },
      { capture: true }
    ),

    addEventListener(
      window,
      DOM_EVENT.TOUCH_MOVE,
      (event: TouchEvent) => {
        // Runs in the bubble phase, after the page's handlers, so `defaultPrevented` reflects a
        // page-level preventDefault (i.e. the page is driving its own scroll/drag).
        if (event.defaultPrevented) {
          pageHandledTouchMove = true
        }
      },
      { capture: false, passive: true }
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
          if (isScrollGesture(pointerDownEvent, event, pageHandledTouchMove)) {
            // The pointer moved like a scroll on a surface the browser is allowed to scroll, yet a
            // pointerup arrived instead of the `pointercancel` a normal browser would fire. That is a
            // native-scroll leak (Android WebView / iOS WKWebView with native/nested scrolling).
            // Recording it would create a spurious click action, so drop it. Drags on surfaces the
            // page owns (touch-action:none / preventDefault) are NOT dropped — a normal browser also
            // delivers pointerup for those, so the SDK keeps recording them as it does today.
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
 * Tells whether a pointerdown -> pointerup sequence is a native-scroll leak rather than a click. A
 * gesture is treated as a scroll only when it is a touch/pen pointer, it travelled more than the
 * scroll threshold, the page did not take over the move (no touchmove preventDefault), and the
 * browser is allowed to pan the surface in the drag direction (effective `touch-action`).
 *
 * The last two conditions preserve today's behavior: a genuine drag interaction (map, carousel,
 * drawing, drag-to-reorder) opts out of browser scrolling via `touch-action:none` or preventDefault,
 * so a normal browser delivers a pointerup for it too and the SDK keeps recording it. We only drop
 * moved pointerups on surfaces the browser WOULD have scrolled — where a normal browser would have
 * fired `pointercancel` — which is exactly the WebView native-scroll leak.
 */
function isScrollGesture(
  pointerDownEvent: MouseEventOnElement | undefined,
  pointerUpEvent: MouseEventOnElement,
  pageHandledTouchMove: boolean
) {
  if (!pointerDownEvent || pointerUpEvent.pointerType === 'mouse') {
    return false
  }
  const deltaX = pointerUpEvent.clientX - pointerDownEvent.clientX
  const deltaY = pointerUpEvent.clientY - pointerDownEvent.clientY
  // Use a positive `>` test so undefined/NaN coordinates count as "not moved" (not a scroll).
  if (!(Math.sqrt(deltaX * deltaX + deltaY * deltaY) > ACTION_SCROLL_DISTANCE_THRESHOLD)) {
    return false
  }
  if (pageHandledTouchMove) {
    return false
  }
  return browserCanPan(pointerDownEvent.target, deltaX, deltaY)
}

/**
 * Whether the browser is allowed to pan (scroll) starting from `target` in the drag direction, per
 * the effective `touch-action` along the ancestor chain. If it is, a normal browser would have taken
 * over the gesture and fired `pointercancel` instead of `pointerup`.
 */
function browserCanPan(target: Element, deltaX: number, deltaY: number): boolean {
  const horizontal = Math.abs(deltaX) > Math.abs(deltaY)
  let element: Element | null = target
  while (element) {
    const touchAction = getComputedStyle(element).touchAction
    if (touchAction === 'none') {
      return false
    }
    if (touchAction !== 'auto' && touchAction !== 'manipulation') {
      // Restricted panning, e.g. 'pan-x', 'pan-y', 'pan-y pinch-zoom', 'pan-left'…
      const canPanHorizontally =
        touchAction.indexOf('pan-x') !== -1 ||
        touchAction.indexOf('pan-left') !== -1 ||
        touchAction.indexOf('pan-right') !== -1
      const canPanVertically =
        touchAction.indexOf('pan-y') !== -1 ||
        touchAction.indexOf('pan-up') !== -1 ||
        touchAction.indexOf('pan-down') !== -1
      if (horizontal ? !canPanHorizontally : !canPanVertically) {
        return false
      }
    }
    element = element.parentElement
  }
  return true
}

import { monitor } from '../entries/monitor'
import type { CookieStore, CookieStoreEventMap } from '../util/globalObject'
import { getZoneJsOriginalValue } from '../util/getZoneJsOriginalValue'
import { noop } from '../util/noop'
import type { VisualViewport, VisualViewportEventMap } from './types'

/**
 * An event that may carry the `__ddIsTrusted` marker.
 *
 * Synthetic events dispatched by the SDK itself (or by test helpers) have `isTrusted: false`. Setting
 * `__ddIsTrusted: true` on them lets {@link addEventListener} accept them even when untrusted events
 * are not allowed (see {@link setAllowUntrustedEvents}).
 */
export type TrustableEvent<E extends Event = Event> = E & { __ddIsTrusted?: boolean }

/**
 * Names of the DOM events listened to by the SDKs.
 *
 * Using this enum instead of string literals keeps event names consistent across the SDKs. Each
 * member's value is the DOM event name.
 */
export const enum DOM_EVENT {
  /** `beforeunload`: the window is about to be unloaded. */
  BEFORE_UNLOAD = 'beforeunload',
  /** `click`: a pointing device button was pressed and released on an element. */
  CLICK = 'click',
  /** `dblclick`: a pointing device button was clicked twice on an element. */
  DBL_CLICK = 'dblclick',
  /** `keydown`: a key was pressed. */
  KEY_DOWN = 'keydown',
  /** `load`: a resource and its dependent resources finished loading. */
  LOAD = 'load',
  /** `popstate`: the active history entry changed through browser navigation (back/forward). */
  POP_STATE = 'popstate',
  /** `scroll`: an element or the document view was scrolled. */
  SCROLL = 'scroll',
  /** `touchstart`: a touch point was placed on the touch surface. */
  TOUCH_START = 'touchstart',
  /** `touchend`: a touch point was removed from the touch surface. */
  TOUCH_END = 'touchend',
  /** `touchmove`: a touch point moved along the touch surface. */
  TOUCH_MOVE = 'touchmove',
  /** `visibilitychange`: the document became visible or hidden. */
  VISIBILITY_CHANGE = 'visibilitychange',
  /** `pageshow`: the page is being displayed, including when restored from the back/forward cache. */
  PAGE_SHOW = 'pageshow',
  /** `freeze`: the page is being frozen by the browser (Page Lifecycle API). */
  FREEZE = 'freeze',
  /** `resume`: the page is being resumed after having been frozen (Page Lifecycle API). */
  RESUME = 'resume',
  /** `DOMContentLoaded`: the HTML document has been parsed and deferred scripts have run. */
  DOM_CONTENT_LOADED = 'DOMContentLoaded',
  /** `pointerdown`: a pointer became active (button pressed, touch contact, pen contact). */
  POINTER_DOWN = 'pointerdown',
  /** `pointerup`: a pointer is no longer active. */
  POINTER_UP = 'pointerup',
  /** `pointercancel`: the browser decided the pointer will not produce more events. */
  POINTER_CANCEL = 'pointercancel',
  /** `hashchange`: the fragment identifier of the URL changed. */
  HASH_CHANGE = 'hashchange',
  /** `pagehide`: the page is being hidden, either unloaded or put in the back/forward cache. */
  PAGE_HIDE = 'pagehide',
  /** `mousedown`: a pointing device button was pressed on an element. */
  MOUSE_DOWN = 'mousedown',
  /** `mouseup`: a pointing device button was released over an element. */
  MOUSE_UP = 'mouseup',
  /** `mousemove`: a pointing device moved over an element. */
  MOUSE_MOVE = 'mousemove',
  /** `focus`: an element or the window received focus. */
  FOCUS = 'focus',
  /** `blur`: an element or the window lost focus. */
  BLUR = 'blur',
  /** `contextmenu`: the user attempted to open a context menu. */
  CONTEXT_MENU = 'contextmenu',
  /** `resize`: the window or visual viewport was resized. */
  RESIZE = 'resize',
  /** `change`: the value of a form control was committed by the user. */
  CHANGE = 'change',
  /** `input`: the value of a form control or editable element changed. */
  INPUT = 'input',
  /** `play`: a media element started or resumed playback. */
  PLAY = 'play',
  /** `pause`: a media element playback was paused. */
  PAUSE = 'pause',
  /** `securitypolicyviolation`: a Content Security Policy was violated. */
  SECURITY_POLICY_VIOLATION = 'securitypolicyviolation',
  /** `selectionchange`: the current text selection changed. */
  SELECTION_CHANGE = 'selectionchange',
  /** `storage`: a Web Storage area (`localStorage` or `sessionStorage`) was modified in another document. */
  STORAGE = 'storage',
  /** `unhandledrejection`: a promise was rejected without a rejection handler. */
  UNHANDLED_REJECTION = 'unhandledrejection',
}

interface AddEventListenerOptions {
  once?: boolean
  capture?: boolean
  passive?: boolean
}

type EventMapFor<T> = T extends Window
  ? WindowEventMap & {
      // TS 4.9.5 does not support `freeze` and `resume` events yet
      freeze: Event
      resume: Event
      // TS 4.9.5 does not define `visibilitychange` on Window (only Document)
      visibilitychange: Event
    }
  : T extends Document
    ? DocumentEventMap & {
        // TS 4.9.5 does not define `prerenderingchange` on Document yet (Speculation Rules / Prerender2)
        prerenderingchange: Event
      }
    : T extends HTMLElement
      ? HTMLElementEventMap
      : T extends VisualViewport
        ? VisualViewportEventMap
        : T extends ShadowRoot
          ? // ShadowRootEventMap is not yet defined in our supported TS version. Instead, use
            // GlobalEventHandlersEventMap which is more than enough as we only need to listen for events bubbling
            // through the ShadowRoot like "change" or "input"
            GlobalEventHandlersEventMap
          : T extends XMLHttpRequest
            ? XMLHttpRequestEventMap
            : T extends Performance
              ? PerformanceEventMap
              : T extends Worker
                ? WorkerEventMap
                : T extends CookieStore
                  ? CookieStoreEventMap
                  : T extends WebSocket
                    ? WebSocketEventMap
                    : Record<never, never>

/**
 * Adds an event listener to an event target (Window, Element, mock object...). Compared to calling
 * `eventTarget.addEventListener` directly, it:
 *
 * - uses the unpatched `addEventListener` / `removeEventListener`, bypassing Zone.js and overrides
 * such as Salesforce LWC's, so listeners don't trigger extra framework work;
 * - wraps the listener with `monitor`, so errors it throws are reported instead of propagated;
 * - ignores untrusted events when configured to (see {@link setAllowUntrustedEvents});
 * - passes an options object only when `passive` is set, and emulates `once`;
 * - returns a `stop` function to remove the listener.
 *
 * @param eventTarget - The target to listen on.
 * @param eventName - The event to listen for; its type narrows the `listener` event type.
 * @param listener - Called with each received event.
 * @param options - `capture`, `passive`, and `once` (the listener is removed after its first call).
 * @returns An object whose `stop` function removes the listener.
 */
export function addEventListener<Target extends EventTarget, EventName extends keyof EventMapFor<Target> & string>(
  eventTarget: Target,
  eventName: EventName,
  listener: (event: EventMapFor<Target>[EventName] & { type: EventName }) => void,
  options?: AddEventListenerOptions
) {
  return addEventListeners(eventTarget, [eventName], listener, options)
}

/**
 * Adds the same listener for several events on an event target. Behaves like
 * {@link addEventListener}, except that with `once: true` the listener is called at most once in
 * total, even if several of the events are received.
 *
 * @param eventTarget - The target to listen on.
 * @param eventNames - The events to listen for.
 * @param listener - Called with each received event.
 * @param options - Listener options.
 * @param options.once - Remove all listeners after the first call.
 * @param options.capture - Listen during the capture phase.
 * @param options.passive - Declare that the listener never calls `preventDefault()`.
 * @returns An object whose `stop` function removes the listeners for all `eventNames`.
 */
export function addEventListeners<Target extends EventTarget, EventName extends keyof EventMapFor<Target> & string>(
  eventTarget: Target,
  eventNames: EventName[],
  listener: (event: EventMapFor<Target>[EventName] & { type: EventName }) => void,
  { once, capture, passive }: AddEventListenerOptions = {}
) {
  const listenerWithMonitor = monitor((event: TrustableEvent) => {
    if (!event.isTrusted && !event.__ddIsTrusted && allowUntrustedEventsFromConfiguration === false) {
      return
    }
    if (once) {
      stop()
    }
    listener(event as unknown as EventMapFor<Target>[EventName] & { type: EventName })
  })

  const options = passive ? { capture, passive } : capture

  // Use the window.EventTarget.prototype when possible to avoid wrong overrides (e.g: https://github.com/salesforce/lwc/issues/1824)
  const listenerTarget =
    window.EventTarget && eventTarget instanceof EventTarget ? window.EventTarget.prototype : eventTarget

  const add = getZoneJsOriginalValue(listenerTarget, 'addEventListener')
  eventNames.forEach((eventName) => add.call(eventTarget, eventName, listenerWithMonitor, options))

  function stop() {
    const remove = getZoneJsOriginalValue(listenerTarget, 'removeEventListener')
    eventNames.forEach((eventName) => remove.call(eventTarget, eventName, listenerWithMonitor, options))
  }

  return {
    stop,
  }
}

/**
 * Checks whether `eventTarget` accepts listeners for `eventName`, by adding and immediately removing
 * a no-op listener.
 *
 * Some targets (e.g. mock objects, or restricted environments) throw when a listener is added; this
 * lets callers feature-detect instead of failing.
 *
 * @param eventTarget - The target to test. `undefined` is accepted and reported as unsupported.
 * @param eventName - The event name to test.
 * @returns `true` if a listener could be added, `false` otherwise.
 */
export function isEventSupported<Target extends EventTarget, EventName extends keyof EventMapFor<Target> & string>(
  eventTarget: Target | undefined,
  eventName: EventName
) {
  if (!eventTarget) {
    return false
  }

  try {
    addEventListener(eventTarget, eventName, noop).stop()
    return true
  } catch {
    return false
  }
}

let allowUntrustedEventsFromConfiguration: boolean | undefined

/**
 * Configures whether listeners registered with {@link addEventListener} receive untrusted events
 * (events with `isTrusted: false`, typically dispatched by scripts).
 *
 * Until this is called, events are not filtered. Once set to `false`, untrusted events are ignored
 * unless marked with `__ddIsTrusted` (see {@link TrustableEvent}). The most permissive value wins:
 * once set to `true`, later calls cannot set it back to `false`.
 *
 * The setting is module-level state, so it is only shared by SDKs that use the same
 * `@datadog/js-core` module instance (e.g. RUM and Logs installed from npm in the same bundle). SDKs
 * loaded as separate CDN bundles each have their own copy.
 *
 * @param value - `true` to accept untrusted events; `false` or `undefined` to ignore them.
 */
export function setAllowUntrustedEvents(value: boolean | undefined) {
  if (allowUntrustedEventsFromConfiguration === true) {
    return // keep the laxer value (true)
  }
  allowUntrustedEventsFromConfiguration = value ?? false
}

/**
 * Resets the setting configured by {@link setAllowUntrustedEvents} to its initial, unset state.
 * Intended for tests.
 *
 * @internal
 */
export function resetAllowUntrustedEvents() {
  allowUntrustedEventsFromConfiguration = undefined
}

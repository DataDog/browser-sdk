import type { CookieStore, CookieStoreEventMap } from '@datadog/js-core/util'
import { monitor } from '../tools/monitor'
import { getZoneJsOriginalValue } from '../tools/getZoneJsOriginalValue'
import { noop } from '../tools/utils/functionUtils'
import type { VisualViewport, VisualViewportEventMap } from './browser.types'

export type TrustableEvent<E extends Event = Event> = E & { __ddIsTrusted?: boolean }

export const enum DOM_EVENT {
  BEFORE_UNLOAD = 'beforeunload',
  CLICK = 'click',
  DBL_CLICK = 'dblclick',
  KEY_DOWN = 'keydown',
  LOAD = 'load',
  POP_STATE = 'popstate',
  SCROLL = 'scroll',
  TOUCH_START = 'touchstart',
  TOUCH_END = 'touchend',
  TOUCH_MOVE = 'touchmove',
  VISIBILITY_CHANGE = 'visibilitychange',
  PAGE_SHOW = 'pageshow',
  FREEZE = 'freeze',
  RESUME = 'resume',
  DOM_CONTENT_LOADED = 'DOMContentLoaded',
  POINTER_DOWN = 'pointerdown',
  POINTER_UP = 'pointerup',
  POINTER_CANCEL = 'pointercancel',
  HASH_CHANGE = 'hashchange',
  PAGE_HIDE = 'pagehide',
  MOUSE_DOWN = 'mousedown',
  MOUSE_UP = 'mouseup',
  MOUSE_MOVE = 'mousemove',
  FOCUS = 'focus',
  BLUR = 'blur',
  CONTEXT_MENU = 'contextmenu',
  RESIZE = 'resize',
  CHANGE = 'change',
  INPUT = 'input',
  PLAY = 'play',
  PAUSE = 'pause',
  SECURITY_POLICY_VIOLATION = 'securitypolicyviolation',
  SELECTION_CHANGE = 'selectionchange',
  STORAGE = 'storage',
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
                  : Record<never, never>

/**
 * Add an event listener to an event target object (Window, Element, mock object...).  This provides
 * a few conveniences compared to using `element.addEventListener` directly:
 *
 * * supports IE11 by: using an option object only if needed and emulating the `once` option
 *
 * * wraps the listener with a `monitor` function
 *
 * * returns a `stop` function to remove the listener
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
 * Add event listeners to an event target object (Window, Element, mock object...).  This provides
 * a few conveniences compared to using `element.addEventListener` directly:
 *
 * * supports IE11 by: using an option object only if needed and emulating the `once` option
 *
 * * wraps the listener with a `monitor` function
 *
 * * returns a `stop` function to remove the listener
 *
 * * with `once: true`, the listener will be called at most once, even if different events are listened
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

export function setAllowUntrustedEvents(value: boolean | undefined) {
  if (allowUntrustedEventsFromConfiguration === true) {
    return // keep the laxer value (true)
  }
  allowUntrustedEventsFromConfiguration = value ?? false
}

export function resetAllowUntrustedEvents() {
  allowUntrustedEventsFromConfiguration = undefined
}

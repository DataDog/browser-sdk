import { monitor } from '../tools/monitor'
import { getZoneJsOriginalValue } from '../tools/getZoneJsOriginalValue'
import type { CookieStore, CookieStoreEventMap, VisualViewport, VisualViewportEventMap } from './types'

export type TrustableEvent<E extends Event = Event> = E & { __ddIsTrusted?: boolean }

// We want to use a real enum (i.e. not a const enum) here, to be able to iterate over it to automatically add _ddIsTrusted in e2e tests
// eslint-disable-next-line no-restricted-syntax
export enum DOM_EVENT {
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
    ? DocumentEventMap
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
  configuration: { allowUntrustedEvents?: boolean | undefined },
  eventTarget: Target,
  eventName: EventName,
  listener: (event: EventMapFor<Target>[EventName] & { type: EventName }) => void,
  options?: AddEventListenerOptions
) {
  return addEventListeners(configuration, eventTarget, [eventName], listener, options)
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
  configuration: { allowUntrustedEvents?: boolean | undefined },
  eventTarget: Target,
  eventNames: EventName[],
  listener: (event: EventMapFor<Target>[EventName] & { type: EventName }) => void,
  { once, capture, passive }: AddEventListenerOptions = {}
) {
  const listenerWithMonitor = monitor((event: TrustableEvent) => {
    if (!event.isTrusted && !event.__ddIsTrusted && !configuration.allowUntrustedEvents) {
      return
    }
    if (once) {
      stop()
    }
    listener(event as unknown as EventMapFor<Target>[EventName] & { type: EventName })
  })

  const options = passive ? { capture, passive } : capture

  const add = getZoneJsOriginalValue(eventTarget, 'addEventListener')
  eventNames.forEach((eventName) => add.call(eventTarget, eventName, listenerWithMonitor, options))

  function stop() {
    const remove = getZoneJsOriginalValue(eventTarget, 'removeEventListener')
    eventNames.forEach((eventName) => remove.call(eventTarget, eventName, listenerWithMonitor, options))
  }

  return {
    stop,
  }
}

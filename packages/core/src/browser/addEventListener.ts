import { monitor } from '../tools/monitor'
import { getZoneJsOriginalValue } from '../tools/getZoneJsOriginalValue'
import type { VisualViewport, VisualViewportEventMap } from './types'

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
  listener: (event: EventMapFor<Target>[EventName]) => void,
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
  listener: (event: EventMapFor<Target>[EventName]) => void,
  { once, capture, passive }: AddEventListenerOptions = {}
) {
  const wrappedListener = monitor(
    once
      ? (event: Event) => {
          stop()
          listener(event as EventMapFor<Target>[EventName])
        }
      : (listener as (event: Event) => void)
  )

  const options = passive ? { capture, passive } : capture

  const add = getZoneJsOriginalValue(eventTarget, 'addEventListener')
  eventNames.forEach((eventName) => add.call(eventTarget, eventName, wrappedListener, options))

  function stop() {
    const remove = getZoneJsOriginalValue(eventTarget, 'removeEventListener')
    eventNames.forEach((eventName) => remove.call(eventTarget, eventName, wrappedListener, options))
  }

  return {
    stop,
  }
}

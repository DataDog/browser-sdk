import { monitor } from '../tools/monitor'
import { getZoneJsOriginalValue } from '../tools/getZoneJsOriginalValue'

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
export function addEventListener<E extends Event>(
  eventTarget: EventTarget,
  event: DOM_EVENT,
  listener: (event: E) => void,
  options?: AddEventListenerOptions
) {
  return addEventListeners(eventTarget, [event], listener, options)
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
export function addEventListeners<E extends Event>(
  eventTarget: EventTarget,
  events: DOM_EVENT[],
  listener: (event: E) => void,
  { once, capture, passive }: AddEventListenerOptions = {}
) {
  const wrappedListener = monitor(
    once
      ? (event: Event) => {
          stop()
          listener(event as E)
        }
      : (listener as (event: Event) => void)
  )

  const options = passive ? { capture, passive } : capture

  const add = getZoneJsOriginalValue(eventTarget, 'addEventListener')
  events.forEach((event) => add.call(eventTarget, event, wrappedListener, options))

  function stop() {
    const remove = getZoneJsOriginalValue(eventTarget, 'removeEventListener')
    events.forEach((event) => remove.call(eventTarget, event, wrappedListener, options))
  }

  return {
    stop,
  }
}

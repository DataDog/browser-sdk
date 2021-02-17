import { monitor } from '../domain/internalMonitoring/monitor'

export enum DOM_EVENT {
  BEFORE_UNLOAD = 'beforeunload',
  CLICK = 'click',
  KEY_DOWN = 'keydown',
  LOAD = 'load',
  POP_STATE = 'popstate',
  SCROLL = 'scroll',
  TOUCH_START = 'touchstart',
  VISIBILITY_CHANGE = 'visibilitychange',
  DOM_CONTENT_LOADED = 'DOMContentLoaded',
  POINTER_DOWN = 'pointerdown',
  POINTER_UP = 'pointerup',
  POINTER_CANCEL = 'pointercancel',
  HASH_CHANGE = 'hashchange',
  PAGE_HIDE = 'pagehide',
  MOUSE_DOWN = 'mousedown',
  FOCUS = 'focus',
  BLUR = 'blur',
}

export interface EventEmitter {
  addEventListener(
    event: DOM_EVENT,
    listener: (event: Event) => void,
    options?: boolean | { capture?: boolean; passive?: boolean }
  ): void
  removeEventListener(
    event: DOM_EVENT,
    listener: (event: Event) => void,
    options?: boolean | { capture?: boolean; passive?: boolean }
  ): void
}

interface AddEventListenerOptions {
  once?: boolean
  capture?: boolean
  passive?: boolean
}

/**
 * Add an event listener to an event emitter object (Window, Element, mock object...).  This provides
 * a few conveniences compared to using `element.addEventListener` directly:
 *
 * * supports IE11 by: using an option object only if needed and emulating the `once` option
 *
 * * wraps the listener with a `monitor` function
 *
 * * returns a `stop` function to remove the listener
 */
export function addEventListener(
  emitter: EventEmitter,
  event: DOM_EVENT,
  listener: (event: Event) => void,
  options?: AddEventListenerOptions
) {
  return addEventListeners(emitter, [event], listener, options)
}

/**
 * Add event listeners to an event emitter object (Window, Element, mock object...).  This provides
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
export function addEventListeners(
  emitter: EventEmitter,
  events: DOM_EVENT[],
  listener: (event: Event) => void,
  { once, capture, passive }: { once?: boolean; capture?: boolean; passive?: boolean } = {}
) {
  const wrapedListener = monitor(
    once
      ? (event: Event) => {
          stop()
          listener(event)
        }
      : listener
  )

  const options = passive ? { capture, passive } : capture
  events.forEach((event) => emitter.addEventListener(event, wrapedListener, options))
  const stop = () => events.forEach((event) => emitter.removeEventListener(event, wrapedListener, options))

  return {
    stop,
  }
}

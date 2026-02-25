import { getGlobalObject } from './globalObject'
import { getZoneJsOriginalValue } from './getZoneJsOriginalValue'

type WindowWithEventTarget = Window & { EventTarget?: typeof EventTarget }

function getListenerTarget(eventTarget: EventTarget): EventTarget {
  const win = getGlobalObject<WindowWithEventTarget>()
  return win.EventTarget && eventTarget instanceof EventTarget ? EventTarget.prototype : eventTarget
}

/**
 * Adds an event listener to a target, bypassing Zone.js patching if present.
 * Uses EventTarget.prototype when possible to avoid overrides in some frameworks.
 */
export function addEventListener(
  target: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
): void {
  const listenerTarget = getListenerTarget(target)
  getZoneJsOriginalValue(listenerTarget, 'addEventListener').call(target, type, listener, options)
}

/**
 * Removes an event listener from a target, bypassing Zone.js patching if present.
 */
export function removeEventListener(
  target: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | EventListenerOptions
): void {
  const listenerTarget = getListenerTarget(target)
  getZoneJsOriginalValue(listenerTarget, 'removeEventListener').call(target, type, listener, options)
}

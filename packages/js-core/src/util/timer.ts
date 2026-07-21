import type { GlobalObject } from './globalObject'
import { globalObject } from './globalObject'
import { getZoneJsOriginalValue } from './getZoneJsOriginalValue'

/**
 * The return type of a `setTimeout` or `setInterval` call.
 *
 * Defined as a named alias so it can be used as an opaque handle without committing to a
 * concrete platform type (`number` in browsers, `NodeJS.Timeout` in Node.js).
 */
export type TimeoutId = ReturnType<GlobalObject['setTimeout']>

/**
 * Zone.js-safe wrapper for `setTimeout`.
 *
 * Looks up the original `setTimeout` via {@link getZoneJsOriginalValue} to bypass any Zone.js
 * patch, preventing the resource-exhaustion issues that Zone.js-patched timers can cause.
 *
 * @param callback - Function to invoke after `delay` milliseconds.
 * @param delay - Delay in milliseconds (defaults to 0).
 * @returns A {@link TimeoutId} that can be passed to {@link clearTimeout}.
 */
export function setTimeout(callback: () => void, delay?: number): TimeoutId {
  return getZoneJsOriginalValue(globalObject, 'setTimeout')(callback, delay)
}

/**
 * Zone.js-safe wrapper for `clearTimeout`.
 *
 * @param timeoutId - The id returned by {@link setTimeout}, or `undefined` (no-op).
 */
export function clearTimeout(timeoutId: TimeoutId | undefined) {
  getZoneJsOriginalValue(globalObject, 'clearTimeout')(timeoutId)
}

/**
 * Zone.js-safe wrapper for `setInterval`.
 *
 * @param callback - Function to invoke every `delay` milliseconds.
 * @param delay - Interval in milliseconds (defaults to 0).
 * @returns A {@link TimeoutId} that can be passed to {@link clearInterval}.
 */
export function setInterval(callback: () => void, delay?: number): TimeoutId {
  return getZoneJsOriginalValue(globalObject, 'setInterval')(callback, delay)
}

/**
 * Zone.js-safe wrapper for `clearInterval`.
 *
 * @param timeoutId - The id returned by {@link setInterval}, or `undefined` (no-op).
 */
export function clearInterval(timeoutId: TimeoutId | undefined) {
  getZoneJsOriginalValue(globalObject, 'clearInterval')(timeoutId)
}

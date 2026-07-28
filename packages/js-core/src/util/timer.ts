import type { GlobalObject } from './globalObject'
import { globalObject } from './globalObject'

interface GlobalObjectWithZoneJs {
  Zone?: {
    // All Zone.js versions expose the __symbol__ method, but we observed that some website have a
    // 'Zone' global variable unrelated to Zone.js, so let's consider this method optional
    // nonetheless.
    __symbol__?: (name: string) => string
  }
}

/**
 * Gets the original value for a global API that was potentially patched by Zone.js.
 *
 * Zone.js (used by Angular) patches a bunch of JS and DOM APIs, including timers, and stores the
 * original value of the patched functions in a hidden property prefixed by `__zone_symbol__`.
 * Using the patched `setTimeout` has been observed to trigger rendering loops in some Angular
 * applications, so this helper is used to bypass the patch. In environments without Zone.js
 * (including Node.js), the `Zone` global is simply absent and this falls back to the plain
 * property.
 *
 * @param target - The object the API is read from (usually the global object).
 * @param name - The property name to read.
 * @returns The original, unpatched value of `target[name]`.
 */
function getZoneJsOriginalValue<Target, Name extends keyof Target & string>(target: Target, name: Name): Target[Name] {
  const targetWithZoneJs = target as Target & GlobalObjectWithZoneJs
  let original: Target[Name] | undefined
  if (targetWithZoneJs.Zone && typeof targetWithZoneJs.Zone.__symbol__ === 'function') {
    original = (target as any)[targetWithZoneJs.Zone.__symbol__(name)]
  }
  if (!original) {
    original = target[name]
  }
  return original
}

/** Identifier returned by {@link setTimeout}/{@link setInterval}, to be passed to their `clear*` counterpart. */
export type TimeoutId = ReturnType<GlobalObject['setTimeout']>

/**
 * Equivalent to the native `setTimeout`, but bypasses patches applied by Zone.js (used by Angular)
 * that have been observed to cause rendering loops. Prefer this over the native `setTimeout` in
 * any code that might run in an Angular application.
 *
 * @param callback - The function to invoke after `delay` milliseconds.
 * @param delay - The delay in milliseconds, defaults to the platform's default (usually `0`).
 * @returns A {@link TimeoutId} to pass to {@link clearTimeout}.
 */
export function setTimeout(callback: () => void, delay?: number): TimeoutId {
  return getZoneJsOriginalValue(globalObject, 'setTimeout')(callback, delay)
}

/**
 * Equivalent to the native `clearTimeout`, but bypasses patches applied by Zone.js. See
 * {@link setTimeout} for more details.
 *
 * @param timeoutId - The {@link TimeoutId} returned by a previous {@link setTimeout} call.
 */
export function clearTimeout(timeoutId: TimeoutId | undefined) {
  getZoneJsOriginalValue(globalObject, 'clearTimeout')(timeoutId)
}

/**
 * Equivalent to the native `setInterval`, but bypasses patches applied by Zone.js. See
 * {@link setTimeout} for more details.
 *
 * @param callback - The function to invoke every `delay` milliseconds.
 * @param delay - The delay in milliseconds, defaults to the platform's default (usually `0`).
 * @returns A {@link TimeoutId} to pass to {@link clearInterval}.
 */
export function setInterval(callback: () => void, delay?: number): TimeoutId {
  return getZoneJsOriginalValue(globalObject, 'setInterval')(callback, delay)
}

/**
 * Equivalent to the native `clearInterval`, but bypasses patches applied by Zone.js. See
 * {@link setTimeout} for more details.
 *
 * @param timeoutId - The {@link TimeoutId} returned by a previous {@link setInterval} call.
 */
export function clearInterval(timeoutId: TimeoutId | undefined) {
  getZoneJsOriginalValue(globalObject, 'clearInterval')(timeoutId)
}

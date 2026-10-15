import { monitor } from '../entries/monitor'
import { globalObject } from './globalObject'

/**
 * Schedules `callback` to run as a microtask, using the native `queueMicrotask` when available
 * and falling back to `Promise.resolve().then(callback)` otherwise.
 *
 * The native implementation is looked up on `globalObject` at call-time to support environments
 * where the global object changes after module initialisation (e.g. Selenium GeckoDriver's
 * `executeScript`). Binding it early with `.bind(globalObject)` throws
 * `"queueMicrotask called on an object that does not implement interface Window"` in those
 * environments; calling it as an unbound method avoids the issue.
 * See https://github.com/mozilla/geckodriver/issues/1798
 *
 * @param callback - The function to schedule as a microtask.
 */
export function queueMicrotask(callback: () => void) {
  // Intentionally avoid .bind(globalObject): in some environments (e.g. Selenium GeckoDriver's
  // executeScript), globalThis is not a proper global object, so calling the bound function throws
  // 'queueMicrotask called on an object that does not implement interface Window'. Calling it as an
  // unbound method is fine, as the proper global object will be used implicitly.
  // See https://github.com/mozilla/geckodriver/issues/1798
  const nativeImplementation = globalObject.queueMicrotask

  if (typeof nativeImplementation === 'function') {
    nativeImplementation(monitor(callback))
  } else {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- the callback is monitored, so it'll never throw
    Promise.resolve().then(monitor(callback))
  }
}

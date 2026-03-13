import { monitor } from './monitor'
import { globalObject } from './globalObject'

export function queueMicrotask(callback: () => void) {
  // Intentionally avoid .bind(globalObject): in some environments (e.g. Selenium GeckoDriver's
  // executeScript), globalThis is not a proper global object, so calling the bound function throws
  // 'queueMicrotask called on an object that does not implement interface Window'. Calling it as an
  // unbound method is fine, as the proper global object will be used implicitly.
  // See https://github.com/mozilla/geckodriver/issues/1798
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const nativeImplementation = globalObject.queueMicrotask

  if (typeof nativeImplementation === 'function') {
    nativeImplementation(monitor(callback))
  } else {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- the callback is monitored, so it'll never throw
    Promise.resolve().then(monitor(callback))
  }
}

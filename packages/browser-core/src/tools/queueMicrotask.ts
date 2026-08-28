import { queueMicrotask as jsCoreQueueMicrotask } from '@datadog/js-core/util'
import { monitor } from '@datadog/js-core/monitor'

export function queueMicrotask(callback: () => void) {
  // Intentionally avoid .bind(globalObject): in some environments (e.g. Selenium GeckoDriver's
  // executeScript), globalThis is not a proper global object, so calling the bound function throws
  // 'queueMicrotask called on an object that does not implement interface Window'. Calling it as an
  // unbound method is fine, as the proper global object will be used implicitly.
  // See https://github.com/mozilla/geckodriver/issues/1798
  jsCoreQueueMicrotask(monitor(callback))
}

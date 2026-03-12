import { monitor } from './monitor'
import { globalObject } from './globalObject'

export function queueMicrotask(callback: () => void) {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const nativeImplementation = globalObject.queueMicrotask
  if (typeof nativeImplementation === 'function') {
    nativeImplementation(monitor(callback))
  } else {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- the callback is monitored, so it'll never throw
    Promise.resolve().then(monitor(callback))
  }
}

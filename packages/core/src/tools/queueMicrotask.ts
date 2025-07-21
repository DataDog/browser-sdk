import { monitor } from './monitor'

export function queueMicrotask(callback: () => void) {
  const nativeImplementation = window.queueMicrotask
  if (typeof nativeImplementation === 'function') {
    nativeImplementation(monitor(callback))
  } else {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- the callback is monitored, so it'll never throw
    Promise.resolve().then(monitor(callback))
  }
}

import { setTimeout, clearTimeout } from './timer'
import { monitor } from './monitor'
import { dateNow } from './utils/timeUtils'

// This type is not yet supported in TS 3.8. Imported from the TS source until we upgrade the
// minimum supported TS version.
// https://github.com/microsoft/TypeScript/blob/13c374a868c926f6a907666a5599992c1351b773/src/lib/dom.generated.d.ts#L9513-L9516
export interface IdleDeadline {
  readonly didTimeout: boolean
  timeRemaining(): DOMHighResTimeStamp
}

/**
 * 'requestIdleCallback' with a shim.
 */
export function requestIdleCallback(callback: (deadline: IdleDeadline) => void, opts?: { timeout?: number }) {
  // Note: check both 'requestIdleCallback' and 'cancelIdleCallback' existence because some polyfills only implement 'requestIdleCallback'.
  if (window.requestIdleCallback && window.cancelIdleCallback) {
    const id = window.requestIdleCallback(monitor(callback), opts)
    return () => window.cancelIdleCallback(id)
  }
  return requestIdleCallbackShim(callback)
}

export const MAX_TASK_TIME = 50

/*
 * Shim from https://developer.chrome.com/blog/using-requestidlecallback#checking_for_requestidlecallback
 * Note: there is no simple way to support the "timeout" option, so we ignore it.
 */
export function requestIdleCallbackShim(callback: (deadline: IdleDeadline) => void) {
  const start = dateNow()
  const timeoutId = setTimeout(() => {
    callback({
      didTimeout: false,
      timeRemaining: () => Math.max(0, MAX_TASK_TIME - (dateNow() - start)),
    })
  }, 0)
  return () => clearTimeout(timeoutId)
}

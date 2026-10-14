import type { TimeoutId } from './timer'
import { setTimeout, clearTimeout } from './timer'

/**
 * Wraps a function so that calls are grouped into throttle windows of `wait` milliseconds. Mirrors
 * lodash's `throttle` API.
 *
 * A window starts on the first call made outside of a window. `fn` is invoked at most once at the
 * start of the window (leading) and at most once at its end with the latest arguments (trailing).
 * Unlike lodash, the trailing invocation does not start a new window: a call made right after it
 * starts a new window and may invoke `fn` again immediately.
 *
 * @param fn - The function to throttle.
 * @param wait - The duration of a throttle window, in milliseconds.
 * @param options - Throttle behavior options.
 * @param options.leading - Invokes `fn` immediately on the first call of a throttle window.
 * Defaults to `true`.
 * @param options.trailing - Invokes `fn` once more at the end of the window if calls happened
 * during it. Defaults to `true`.
 * @returns An object with `throttled`, the throttled function to call instead of `fn`, and
 * `cancel`, which cancels any pending trailing invocation and resets the throttle window.
 */
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  wait: number,
  options?: { leading?: boolean; trailing?: boolean }
) {
  const needLeadingExecution = options?.leading !== undefined ? options.leading : true
  const needTrailingExecution = options?.trailing !== undefined ? options.trailing : true
  let inWaitPeriod = false
  let pendingExecutionWithParameters: Parameters<T> | undefined
  let pendingTimeoutId: TimeoutId

  return {
    throttled: (...parameters: Parameters<T>) => {
      if (inWaitPeriod) {
        pendingExecutionWithParameters = parameters
        return
      }
      if (needLeadingExecution) {
        fn(...parameters)
      } else {
        pendingExecutionWithParameters = parameters
      }
      inWaitPeriod = true
      pendingTimeoutId = setTimeout(() => {
        if (needTrailingExecution && pendingExecutionWithParameters) {
          fn(...pendingExecutionWithParameters)
        }
        inWaitPeriod = false
        pendingExecutionWithParameters = undefined
      }, wait)
    },
    cancel: () => {
      clearTimeout(pendingTimeoutId)
      inWaitPeriod = false
      pendingExecutionWithParameters = undefined
    },
  }
}

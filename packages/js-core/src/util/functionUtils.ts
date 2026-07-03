import type { TimeoutId } from './timer'
import { setTimeout, clearTimeout } from './timer'

/**
 * Wraps a function so it is invoked at most once per `wait` period, regardless of how many times
 * the returned `throttled` function is called during that period. Mirrors lodash's `throttle` API.
 *
 * @param fn - The function to throttle.
 * @param wait - The minimum delay, in milliseconds, between two invocations of `fn`.
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

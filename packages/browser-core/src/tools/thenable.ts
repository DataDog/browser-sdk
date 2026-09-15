import type { TimeoutId } from './timer'
import { setTimeout, clearTimeout } from './timer'

export function isThenable<T>(value: unknown): value is PromiseLike<T> {
  return !!value && typeof (value as { then?: unknown }).then === 'function'
}

export const TIMEOUT_ERROR_MESSAGE = 'Timeout'
export function isTimeoutError(error: unknown): error is Error {
  return error instanceof Error && error.message === TIMEOUT_ERROR_MESSAGE
}

/**
 * Resolves or rejects with `thenable`, or rejects with a `TIMEOUT_ERROR_MESSAGE` error if it
 * doesn't settle within `timeout` ms.
 */
export function waitForThenable<T>(thenable: PromiseLike<T>, timeout = 3000): Promise<T> {
  let timeoutId: TimeoutId
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(TIMEOUT_ERROR_MESSAGE)), timeout)
  })
  return Promise.race([thenable, timeoutPromise]).finally(() => clearTimeout(timeoutId))
}

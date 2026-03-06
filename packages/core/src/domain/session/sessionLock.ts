import { mockable } from '../../tools/mockable'
import { SESSION_STORE_KEY } from './storeStrategies/sessionStoreStrategy'

let lockPromise: Promise<void> | undefined

export function withNativeSessionLock(fn: () => void | Promise<void>): void {
  if (navigator?.locks) {
    void navigator.locks.request(SESSION_STORE_KEY, fn)
    return
  }
  // Chain async callbacks to prevent interleaving
  if (!lockPromise) {
    lockPromise = Promise.resolve()
  }
  lockPromise = lockPromise.then(fn, fn)
}

export function withSessionLock(fn: () => void | Promise<void>): void {
  mockable(withNativeSessionLock)(fn)
}

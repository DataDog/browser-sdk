import { mockable } from '../../tools/mockable'
import { SESSION_STORE_KEY } from './storeStrategies/sessionStoreStrategy'

export function withNativeSessionLock(fn: () => void): void {
  if (navigator?.locks) {
    void navigator.locks.request(SESSION_STORE_KEY, fn)
    return
  }
  fn()
}

export function withSessionLock(fn: () => void): void {
  mockable(withNativeSessionLock)(fn)
}

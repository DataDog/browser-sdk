import { mockable } from '../../tools/mockable'
import { addTelemetryDebug } from '../telemetry'
import { SESSION_STORE_KEY } from './storeStrategies/sessionStoreStrategy'

export function withNativeSessionLock(fn: () => void): void {
  if (navigator?.locks) {
    void navigator.locks.request(SESSION_STORE_KEY, fn).catch((error) => {
      // monitor-until: 2026-09-11
      addTelemetryDebug('Session lock failed', { error: String(error) })
    })
    return
  }
  fn()
}

export function withSessionLock(fn: () => void): void {
  mockable(withNativeSessionLock)(fn)
}

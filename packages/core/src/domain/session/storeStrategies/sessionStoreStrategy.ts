import type { CookieOptions } from '../../../browser/cookie'
import type { SessionState } from '../sessionState'

export const SESSION_STORE_KEY = '_dd_s'

export type SessionStoreStrategyType = { type: 'Cookie'; cookieOptions: CookieOptions } | { type: 'LocalStorage' }

type LockOptions = {
  /**
   * If enabled, lock strategy will be applied while processing store operations.
   * Lock strategy allows mitigating issues due to concurrent access:
   * - To cookies on chromium browsers. Enabling this on firefox increases cookie write failures.
   * - To Local Storage on chromium browsers.
   */
  enabled: boolean

  /**
   * Some storages do not synchronize instantly between browser windows after a write operation.
   * Lock strategy must be enabled for this property to be taken into account.
   * - Cookies: Not affected
   * - Local Storage: Chromium based browsers seem to require at least 5ms
   */
  synchronizationLatency: number
}

export interface SessionStoreStrategy {
  lockOptions: LockOptions
  persistSession: (session: SessionState) => void
  retrieveSession: () => SessionState
  clearSession: () => void
}

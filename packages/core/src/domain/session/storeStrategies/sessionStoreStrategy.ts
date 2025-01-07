import type { CookieOptions } from '../../../browser/cookie'
import type { SessionPersistence } from '../sessionConstants'
import type { SessionState } from '../sessionState'

export const SESSION_STORE_KEY = '_dd_s'

export type SessionStoreStrategyType =
  | { type: typeof SessionPersistence.COOKIE; cookieOptions: CookieOptions }
  | { type: typeof SessionPersistence.LOCAL_STORAGE }

export interface SessionStoreStrategy {
  isLockEnabled: boolean
  persistSession: (session: SessionState) => void
  retrieveSession: () => SessionState
  expireSession: (previousSessionState: SessionState) => void
}

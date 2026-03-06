import type { CookieOptions } from '../../../browser/cookie'
import type { SessionPersistence } from '../sessionConstants'
import type { SessionState } from '../sessionState'

export const SESSION_STORE_KEY = '_dd_s'

export type SessionStoreStrategyType =
  | { type: typeof SessionPersistence.COOKIE; cookieOptions: CookieOptions }
  | { type: typeof SessionPersistence.LOCAL_STORAGE }
  | { type: typeof SessionPersistence.MEMORY }

export interface SessionStoreStrategy {
  persistSession: (session: SessionState) => Promise<void>
  retrieveSession: () => Promise<SessionState>
  expireSession: (previousSessionState: SessionState) => Promise<void>
  onExternalChange?: (callback: () => void) => () => void
}

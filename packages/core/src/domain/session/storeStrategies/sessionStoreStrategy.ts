import type { CookieOptions } from '../../../browser/cookie'
import type { SessionState } from '../sessionState'

export type SessionStoreStrategyType = 'COOKIE' | 'LOCAL_STORAGE'

export interface SessionStoreOptions {
  allowFallbackToLocalStorage: boolean
  cookie: CookieOptions
}

export interface SessionStoreStrategy {
  persistSession: (session: SessionState) => void
  retrieveSession: () => SessionState
  clearSession: () => void
}

import type { CookieOptions } from '../../../browser/cookie'
import type { SessionState } from '../sessionState'

export type SessionStoreStrategyType = { type: 'Cookie'; cookieOptions: CookieOptions } | { type: 'LocalStorage' }

export interface SessionStoreStrategy {
  persistSession: (session: SessionState) => void
  retrieveSession: () => SessionState
  clearSession: () => void
}

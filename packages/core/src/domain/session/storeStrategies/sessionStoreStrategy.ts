import type { CookieOptions } from '../../../browser/cookie'
import type { SessionPersistence } from '../sessionConstants'
import type { SessionState } from '../sessionState'
import type { Observable } from '../../../tools/observable'

export const SESSION_STORE_KEY = '_dd_s_v2'
export const LEGACY_SESSION_STORE_KEY = '_dd_s'

export type SessionStoreStrategyType =
  | { type: typeof SessionPersistence.COOKIE; cookieOptions: CookieOptions }
  | { type: typeof SessionPersistence.LOCAL_STORAGE }
  | { type: typeof SessionPersistence.MEMORY }

export interface SessionObservableEvent {
  cookieValue: string | undefined
  sessionState: SessionState
}

export interface SessionStoreStrategy {
  setSessionState(fn: (sessionState: SessionState) => SessionState, options?: { migrate?: boolean }): Promise<void>
  sessionObservable: Observable<SessionObservableEvent>
}

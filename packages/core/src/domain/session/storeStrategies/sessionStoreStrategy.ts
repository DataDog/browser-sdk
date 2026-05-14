import type { CookieOptions } from '../../../browser/cookie'
import type { SessionPersistence } from '../sessionConstants'
import type { SessionState } from '../sessionState'
import type { Observable } from '../../../tools/observable'

export const SESSION_STORE_KEY = '_dd_s_v2'
export const LEGACY_SESSION_STORE_KEY = '_dd_s'

export const CookieApi = {
  COOKIE_STORE: 'cookieStore',
  DOCUMENT_COOKIE: 'documentCookie',
} as const
export type CookieApi = (typeof CookieApi)[keyof typeof CookieApi]

export interface CookieSessionStoreStrategyType {
  type: typeof SessionPersistence.COOKIE
  cookieOptions: CookieOptions
  cookieApi: CookieApi
}

export type SessionStoreStrategyType =
  | CookieSessionStoreStrategyType
  | { type: typeof SessionPersistence.LOCAL_STORAGE }
  | { type: typeof SessionPersistence.MEMORY }

export interface SessionObservableEvent {
  cookieValues?: string[]
  sessionState: SessionState
}

export interface SessionStoreStrategy {
  setSessionState(fn: (sessionState: SessionState) => SessionState): Promise<void>
  sessionObservable: Observable<SessionObservableEvent>
}

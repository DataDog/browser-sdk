import type { CookieOptions } from '../../../browser/cookie'
import type { CustomCookieStore } from '../../../browser/cookieAccess'
import type { SessionPersistence } from '../sessionConstants'
import type { SessionState } from '../sessionState'
import type { Observable } from '../../../tools/observable'

export const SESSION_STORE_KEY = '_dd_s_v2'
export const LEGACY_SESSION_STORE_KEY = '_dd_s'

export const enum CookieApi {
  DOCUMENT_COOKIE,
  COOKIE_STORE,
}

export interface CookieSessionStoreStrategyType {
  type: typeof SessionPersistence.COOKIE
  cookieOptions: CookieOptions
  cookieApi: CookieApi
}

// Cookie persistence through a cookie store provided in `sessionPersistence`
export interface CustomCookieSessionStoreStrategyType {
  type: 'custom-cookie'
  cookieOptions: CookieOptions
  cookieStore: CustomCookieStore
}

export type SessionStoreStrategyType =
  | CookieSessionStoreStrategyType
  | CustomCookieSessionStoreStrategyType
  | { type: typeof SessionPersistence.LOCAL_STORAGE }
  | { type: typeof SessionPersistence.MEMORY }

export type SessionStateOperation =
  | 'initialize'
  | 'expandOrRenewOnActivity'
  | 'expandOrRenewOnConsent'
  | 'expandOnVisibility'
  | 'initializeOnResume'
  | 'expireOnTimeout'
  | 'expire'
  | 'updateState'

export interface SessionStoreStrategy {
  setSessionState(fn: (sessionState: SessionState) => SessionState, operation: SessionStateOperation): Promise<void>
  sessionObservable: Observable<SessionState>
}

import type { Observable } from '@datadog/js-core/util'
import type { CookieOptions } from '../../../browser/cookie'
import type { CookieAccessFactory } from '../../../browser/cookieAccess'
import type { SessionPersistence } from '../sessionConstants'
import type { SessionState } from '../sessionState'

export const SESSION_STORE_KEY = '_dd_s_v2'
export const LEGACY_SESSION_STORE_KEY = '_dd_s'

export const enum CookieApi {
  DOCUMENT_COOKIE,
  COOKIE_STORE,
}

export interface CookieSessionStoreStrategyType {
  type: typeof SessionPersistence.COOKIE
  cookieOptions: CookieOptions
  // A factory when the cookies are accessed through a host API (ex: the Shopify app pixel plugin)
  cookieApi: CookieApi | CookieAccessFactory
}

export type SessionStoreStrategyType =
  | CookieSessionStoreStrategyType
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

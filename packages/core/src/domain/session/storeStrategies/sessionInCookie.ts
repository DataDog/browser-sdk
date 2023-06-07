import type { CookieOptions } from '../../../browser/cookie'
import { getCurrentSite, areCookiesAuthorized, deleteCookie, getCookie, setCookie } from '../../../browser/cookie'
import type { InitConfiguration } from '../../configuration'
import { tryOldCookiesMigration } from '../oldCookiesMigration'
import { SESSION_EXPIRATION_DELAY } from '../sessionConstants'
import type { SessionState } from '../sessionState'
import { toSessionString, toSessionState } from '../sessionState'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'

export const SESSION_COOKIE_NAME = '_dd_s'

export function selectCookieStrategy(initConfiguration: InitConfiguration): SessionStoreStrategyType | undefined {
  const cookieOptions = buildCookieOptions(initConfiguration)
  return areCookiesAuthorized(cookieOptions) ? { type: 'Cookie', cookieOptions } : undefined
}

export function initCookieStrategy(cookieOptions: CookieOptions): SessionStoreStrategy {
  const cookieStore = {
    persistSession: persistSessionCookie(cookieOptions),
    retrieveSession: retrieveSessionCookie,
    clearSession: deleteSessionCookie(cookieOptions),
  }

  tryOldCookiesMigration(SESSION_COOKIE_NAME, cookieStore)

  return cookieStore
}

function persistSessionCookie(options: CookieOptions) {
  return (session: SessionState) => {
    setCookie(SESSION_COOKIE_NAME, toSessionString(session), SESSION_EXPIRATION_DELAY, options)
  }
}

function retrieveSessionCookie(): SessionState {
  const sessionString = getCookie(SESSION_COOKIE_NAME)
  return toSessionState(sessionString)
}

function deleteSessionCookie(options: CookieOptions) {
  return () => {
    deleteCookie(SESSION_COOKIE_NAME, options)
  }
}

export function buildCookieOptions(initConfiguration: InitConfiguration) {
  const cookieOptions: CookieOptions = {}

  cookieOptions.secure = !!initConfiguration.useSecureSessionCookie || !!initConfiguration.useCrossSiteSessionCookie
  cookieOptions.crossSite = !!initConfiguration.useCrossSiteSessionCookie

  if (initConfiguration.trackSessionAcrossSubdomains) {
    cookieOptions.domain = getCurrentSite()
  }

  return cookieOptions
}

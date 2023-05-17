import type { CookieOptions } from '../../browser/cookie'
import { areCookiesAuthorized, deleteCookie, getCookie, setCookie } from '../../browser/cookie'
import { tryOldCookiesMigration } from './oldCookiesMigration'
import { SESSION_EXPIRATION_DELAY } from './sessionConstants'
import type { SessionState, SessionStore } from './sessionStore'
import { toSessionState, toSessionString } from './sessionStore'

export const SESSION_COOKIE_NAME = '_dd_s'

export function initCookieStore(options: CookieOptions): SessionStore | undefined {
  if (!areCookiesAuthorized(options)) {
    return undefined
  }

  const cookieStore = {
    persistSession: persistSessionCookie(options),
    retrieveSession: retrieveSessionCookie,
    clearSession: deleteSessionCookie(options),
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

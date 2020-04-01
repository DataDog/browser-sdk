import { CookieCache, getCookie, setCookie } from './cookie'
import { isValidSessionString, persistSession, SessionState } from './sessionManagement'

export const OLD_RUM_COOKIE_NAME = '_dd_r'
export const OLD_LOGS_COOKIE_NAME = '_dd_l'

// duplicate values to avoid dependency issues
export const RUM_SESSION_KEY = 'rum'
export const LOGS_SESSION_KEY = 'logs'

/**
 * This migration should remain in the codebase as long as older versions are available/live
 * to allow older sdk versions to be upgraded to newer versions without compatibility issues.
 */
export function tryOldCookiesMigration(sessionCookie: CookieCache) {
  const sessionString = sessionCookie.get()
  const rumType = getCookie(OLD_RUM_COOKIE_NAME)
  const logsType = getCookie(OLD_LOGS_COOKIE_NAME)
  if (rumType || logsType) {
    setCookie(OLD_LOGS_COOKIE_NAME, '', 0)
    setCookie(OLD_RUM_COOKIE_NAME, '', 0)
  }
  if (!isValidSessionString(sessionString)) {
    const session: SessionState = {}
    if (sessionString) {
      session.id = sessionString
    }
    if (logsType && /^[01]$/.test(logsType)) {
      session[LOGS_SESSION_KEY] = logsType
    }
    if (rumType && /^[012]$/.test(rumType)) {
      session[RUM_SESSION_KEY] = rumType
    }
    persistSession(session, sessionCookie)
  }
}

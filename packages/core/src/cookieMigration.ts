import { CookieCache, setCookie } from './cookie'
import { EXPIRATION_DELAY, isValidSessionString, retrieveSession } from './sessionManagement'

// duplicate values to avoid dependency issues
export const RUM_COOKIE_NAME = '_dd_r'
export const LOGS_COOKIE_NAME = '_dd_l'

export const NEW_RUM_SESSION_KEY = 'rum'
export const NEW_LOGS_SESSION_KEY = 'logs'

export function tryCookieMigration(sessionCookie: CookieCache) {
  const sessionString = sessionCookie.get()
  if (isValidSessionString(sessionString)) {
    const session = retrieveSession(sessionCookie)
    sessionCookie.set(session.id || '', EXPIRATION_DELAY)
    setCookie(LOGS_COOKIE_NAME, session[NEW_LOGS_SESSION_KEY] || '', EXPIRATION_DELAY)
    setCookie(RUM_COOKIE_NAME, session[NEW_RUM_SESSION_KEY] || '', EXPIRATION_DELAY)
  }
}

import type { CookieOptions } from '../../browser/cookie'
import { getCookie } from '../../browser/cookie'
import type { SessionState } from './sessionStore'
import { SESSION_COOKIE_NAME, persistSession } from './sessionCookieStore'

export const OLD_SESSION_COOKIE_NAME = '_dd'
export const OLD_RUM_COOKIE_NAME = '_dd_r'
export const OLD_LOGS_COOKIE_NAME = '_dd_l'

// duplicate values to avoid dependency issues
export const RUM_SESSION_KEY = 'rum'
export const LOGS_SESSION_KEY = 'logs'

/**
 * This migration should remain in the codebase as long as older versions are available/live
 * to allow older sdk versions to be upgraded to newer versions without compatibility issues.
 */
export function tryOldCookiesMigration(options: CookieOptions) {
  const sessionString = getCookie(SESSION_COOKIE_NAME)
  const oldSessionId = getCookie(OLD_SESSION_COOKIE_NAME)
  const oldRumType = getCookie(OLD_RUM_COOKIE_NAME)
  const oldLogsType = getCookie(OLD_LOGS_COOKIE_NAME)
  if (!sessionString) {
    const session: SessionState = {}
    if (oldSessionId) {
      session.id = oldSessionId
    }
    if (oldLogsType && /^[01]$/.test(oldLogsType)) {
      session[LOGS_SESSION_KEY] = oldLogsType
    }
    if (oldRumType && /^[012]$/.test(oldRumType)) {
      session[RUM_SESSION_KEY] = oldRumType
    }
    persistSession(session, options)
  }
}

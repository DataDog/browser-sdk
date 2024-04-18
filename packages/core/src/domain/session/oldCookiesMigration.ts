import { getInitCookie } from '../../browser/cookie'
import type { SessionStoreStrategy } from './storeStrategies/sessionStoreStrategy'
import { SESSION_STORE_KEY } from './storeStrategies/sessionStoreStrategy'
import type { SessionState } from './sessionState'
import { expandSessionState, isSessionStarted } from './sessionState'

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
export function tryOldCookiesMigration(cookieStoreStrategy: SessionStoreStrategy) {
  const sessionString = getInitCookie(SESSION_STORE_KEY)
  if (!sessionString) {
    const oldSessionId = getInitCookie(OLD_SESSION_COOKIE_NAME)
    const oldRumType = getInitCookie(OLD_RUM_COOKIE_NAME)
    const oldLogsType = getInitCookie(OLD_LOGS_COOKIE_NAME)
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

    if (isSessionStarted(session)) {
      expandSessionState(session)
      cookieStoreStrategy.persistSession(session)
    }
  }
}

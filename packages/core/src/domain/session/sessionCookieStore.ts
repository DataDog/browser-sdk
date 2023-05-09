import type { CookieOptions } from '../../browser/cookie'
import { deleteCookie, getCookie, setCookie } from '../../browser/cookie'
import { isChromium } from '../../tools/utils/browserDetection'
import { dateNow } from '../../tools/utils/timeUtils'
import { objectEntries } from '../../tools/utils/polyfills'
import { isEmptyObject } from '../../tools/utils/objectUtils'
import { SESSION_EXPIRATION_DELAY } from './sessionConstants'
import type { SessionState } from './sessionStorage'

const SESSION_ENTRY_REGEXP = /^([a-z]+)=([a-z0-9-]+)$/
const SESSION_ENTRY_SEPARATOR = '&'

export const SESSION_COOKIE_NAME = '_dd_s'

export function persistSessionCookie(session: SessionState, options: CookieOptions) {
  if (isExpiredState(session)) {
    deleteSessionCookie(options)
    return
  }
  session.expire = String(dateNow() + SESSION_EXPIRATION_DELAY)
  setSessionCookie(session, options)
}

export function setSessionCookie(session: SessionState, options: CookieOptions) {
  setCookie(SESSION_COOKIE_NAME, toSessionString(session), SESSION_EXPIRATION_DELAY, options)
}

export function toSessionString(session: SessionState) {
  return objectEntries(session)
    .map(([key, value]) => `${key}=${value as string}`)
    .join(SESSION_ENTRY_SEPARATOR)
}

export function retrieveSessionCookie(): SessionState {
  const sessionString = getCookie(SESSION_COOKIE_NAME)
  const session: SessionState = {}
  if (isValidSessionString(sessionString)) {
    sessionString.split(SESSION_ENTRY_SEPARATOR).forEach((entry) => {
      const matches = SESSION_ENTRY_REGEXP.exec(entry)
      if (matches !== null) {
        const [, key, value] = matches
        session[key] = value
      }
    })
  }
  return session
}

export function deleteSessionCookie(options: CookieOptions) {
  deleteCookie(SESSION_COOKIE_NAME, options)
}

function isValidSessionString(sessionString: string | undefined): sessionString is string {
  return (
    sessionString !== undefined &&
    (sessionString.indexOf(SESSION_ENTRY_SEPARATOR) !== -1 || SESSION_ENTRY_REGEXP.test(sessionString))
  )
}

export function isExpiredState(session: SessionState) {
  return isEmptyObject(session)
}

/**
 * Cookie lock strategy allows mitigating issues due to concurrent access to cookie.
 * This issue concerns only chromium browsers and enabling this on firefox increase cookie write failures.
 */
export function isCookieLockEnabled() {
  return isChromium()
}

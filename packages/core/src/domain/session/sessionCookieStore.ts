import type { CookieOptions } from '../../browser/cookie'
import { COOKIE_ACCESS_DELAY, deleteCookie, getCookie, setCookie } from '../../browser/cookie'
import { isChromium } from '../../tools/utils/browserDetection'
import { objectEntries } from '../../tools/utils/polyfills'
import { SESSION_EXPIRATION_DELAY } from './sessionConstants'
import type { SessionState, SessionStore } from './sessionStore'

const SESSION_ENTRY_REGEXP = /^([a-z]+)=([a-z0-9-]+)$/
const SESSION_ENTRY_SEPARATOR = '&'

export const SESSION_COOKIE_NAME = '_dd_s'

// Arbitrary values
export const LOCK_RETRY_DELAY = 10
export const MAX_NUMBER_OF_LOCK_RETRIES = 100

export function initCookieStore(options: CookieOptions): SessionStore {
  return {
    storeAccessOptions: {
      pollDelay: COOKIE_ACCESS_DELAY,
      /**
       * Cookie lock strategy allows mitigating issues due to concurrent access to cookie.
       * This issue concerns only chromium browsers and enabling this on firefox increase cookie write failures.
       */
      lockEnabled: isChromium(),
      lockRetryDelay: LOCK_RETRY_DELAY,
      lockMaxTries: MAX_NUMBER_OF_LOCK_RETRIES,
    },
    persistSession: persistSessionCookie(options),
    retrieveSession: retrieveSessionCookie,
    clearSession: deleteSessionCookie(options),
  }
}

export function persistSessionCookie(options: CookieOptions) {
  return (session: SessionState) => {
    setCookie(SESSION_COOKIE_NAME, toSessionString(session), SESSION_EXPIRATION_DELAY, options)
  }
}

export function toSessionString(session: SessionState) {
  return objectEntries(session)
    .map(([key, value]) => `${key}=${value as string}`)
    .join(SESSION_ENTRY_SEPARATOR)
}

function retrieveSessionCookie(): SessionState {
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
  return () => {
    deleteCookie(SESSION_COOKIE_NAME, options)
  }
}

function isValidSessionString(sessionString: string | undefined): sessionString is string {
  return (
    sessionString !== undefined &&
    (sessionString.indexOf(SESSION_ENTRY_SEPARATOR) !== -1 || SESSION_ENTRY_REGEXP.test(sessionString))
  )
}

import { CookieOptions, getCookie, setCookie } from '../../browser/cookie'
import * as utils from '../../tools/utils'
import { SessionState, SESSION_EXPIRATION_DELAY } from './sessionStore'

const SESSION_ENTRY_REGEXP = /^([a-z]+)=([a-z0-9-]+)$/
const SESSION_ENTRY_SEPARATOR = '&'

export const SESSION_COOKIE_NAME = '_dd_s'

export function withCookieLockAccess({
  process,
  after,
  options
}: {
  process: (cookieSession: SessionState) => SessionState | undefined
  after?: (cookieSession: SessionState) => void,
  options: CookieOptions
}) {
  const initialSession = retrieveSession()
  const processedSession = process(initialSession)
  if (processedSession) {
    persistSession(processedSession, options)
  }
  after?.(processedSession || initialSession)
}

export function persistSession(session: SessionState, options: CookieOptions) {
  if (utils.isEmptyObject(session)) {
    clearSession(options)
    return
  }
  session.expire = String(Date.now() + SESSION_EXPIRATION_DELAY)
  const cookieString = utils
    .objectEntries(session)
    .map(([key, value]) => `${key}=${value as string}`)
    .join(SESSION_ENTRY_SEPARATOR)
  setCookie(SESSION_COOKIE_NAME, cookieString, SESSION_EXPIRATION_DELAY, options)
}

export function retrieveSession(): SessionState {
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

function isValidSessionString(sessionString: string | undefined): sessionString is string {
  return (
    sessionString !== undefined &&
    (sessionString.indexOf(SESSION_ENTRY_SEPARATOR) !== -1 || SESSION_ENTRY_REGEXP.test(sessionString))
  )
}

function clearSession(options: CookieOptions) {
  setCookie(SESSION_COOKIE_NAME, '', 0, options)
}

import { CookieCache, CookieOptions, cacheCookieAccess, COOKIE_ACCESS_DELAY } from '../../browser/cookie'
import { Observable } from '../../tools/observable'
import * as utils from '../../tools/utils'
import { monitor } from '../internalMonitoring'

export interface SessionStore {
  expandOrRenewSession: () => void
  expandSession: () => void
  retrieveSession: () => SessionState
  renewObservable: Observable<void>
}

export interface SessionState {
  id?: string
  created?: string
  expire?: string

  [key: string]: string | undefined
}

export const SESSION_COOKIE_NAME = '_dd_s'
export const SESSION_EXPIRATION_DELAY = 15 * utils.ONE_MINUTE
export const SESSION_TIME_OUT_DELAY = 4 * utils.ONE_HOUR

export function startSessionStore<TrackingType extends string>(
  options: CookieOptions,
  productKey: string,
  computeSessionState: (rawTrackingType?: string) => { trackingType: TrackingType; isTracked: boolean }
): SessionStore {
  const renewObservable = new Observable<void>()
  const sessionCookie = cacheCookieAccess(SESSION_COOKIE_NAME, options)
  let inMemorySession = retrieveActiveSession(sessionCookie)

  const { throttled: expandOrRenewSession } = utils.throttle(
    monitor(() => {
      sessionCookie.clearCache()
      const cookieSession = retrieveActiveSession(sessionCookie)
      const { trackingType, isTracked } = computeSessionState(cookieSession[productKey])
      cookieSession[productKey] = trackingType
      if (isTracked && !cookieSession.id) {
        cookieSession.id = utils.generateUUID()
        cookieSession.created = String(Date.now())
      }
      // save changes and expand session duration
      persistSession(cookieSession, sessionCookie)

      // If the session id has changed, notify that the session has been renewed
      if (isTracked && inMemorySession.id !== cookieSession.id) {
        inMemorySession = { ...cookieSession }
        renewObservable.notify()
      }
      inMemorySession = { ...cookieSession }
    }),
    COOKIE_ACCESS_DELAY
  )

  function expandSession() {
    sessionCookie.clearCache()
    const session = retrieveActiveSession(sessionCookie)
    persistSession(session, sessionCookie)
  }

  function retrieveSession() {
    return retrieveActiveSession(sessionCookie)
  }

  return {
    expandOrRenewSession,
    expandSession,
    retrieveSession,
    renewObservable,
  }
}

const SESSION_ENTRY_REGEXP = /^([a-z]+)=([a-z0-9-]+)$/

const SESSION_ENTRY_SEPARATOR = '&'

export function isValidSessionString(sessionString: string | undefined): sessionString is string {
  return (
    sessionString !== undefined &&
    (sessionString.indexOf(SESSION_ENTRY_SEPARATOR) !== -1 || SESSION_ENTRY_REGEXP.test(sessionString))
  )
}

function retrieveActiveSession(sessionCookie: CookieCache): SessionState {
  const session = retrieveSession(sessionCookie)
  if (isActiveSession(session)) {
    return session
  }
  clearSession(sessionCookie)
  return {}
}

function isActiveSession(session: SessionState) {
  // created and expire can be undefined for versions which was not storing them
  // these checks could be removed when older versions will not be available/live anymore
  return (
    (session.created === undefined || Date.now() - Number(session.created) < SESSION_TIME_OUT_DELAY) &&
    (session.expire === undefined || Date.now() < Number(session.expire))
  )
}

function retrieveSession(sessionCookie: CookieCache): SessionState {
  const sessionString = sessionCookie.get()
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

export function persistSession(session: SessionState, cookie: CookieCache) {
  if (utils.isEmptyObject(session)) {
    clearSession(cookie)
    return
  }
  session.expire = String(Date.now() + SESSION_EXPIRATION_DELAY)
  const cookieString = utils
    .objectEntries(session)
    .map(([key, value]) => `${key}=${value as string}`)
    .join(SESSION_ENTRY_SEPARATOR)
  cookie.set(cookieString, SESSION_EXPIRATION_DELAY)
}

function clearSession(cookie: CookieCache) {
  cookie.set('', 0)
}

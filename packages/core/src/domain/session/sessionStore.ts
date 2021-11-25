import { CookieOptions, COOKIE_ACCESS_DELAY, setCookie, getCookie } from '../../browser/cookie'
import { Observable } from '../../tools/observable'
import * as utils from '../../tools/utils'
import { monitor } from '../internalMonitoring'

export interface SessionStore {
  expandOrRenewSession: () => void
  expandSession: () => void
  getSession: () => SessionState
  renewObservable: Observable<void>
  stop: () => void
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

const SESSION_ENTRY_REGEXP = /^([a-z]+)=([a-z0-9-]+)$/
const SESSION_ENTRY_SEPARATOR = '&'

export function startSessionStore<TrackingType extends string>(
  options: CookieOptions,
  productKey: string,
  computeSessionState: (rawTrackingType?: string) => { trackingType: TrackingType; isTracked: boolean }
): SessionStore {
  const renewObservable = new Observable<void>()
  let sessionCache: SessionState = retrieveActiveSession(options)

  const { throttled: expandOrRenewSession } = utils.throttle(
    monitor(() => {
      const cookieSession = retrieveActiveSession(options)
      const { trackingType, isTracked } = computeSessionState(cookieSession[productKey])
      cookieSession[productKey] = trackingType
      if (isTracked && !cookieSession.id) {
        cookieSession.id = utils.generateUUID()
        cookieSession.created = String(Date.now())
      }
      // save changes and expand session duration
      persistSession(cookieSession, options)

      if (isTracked && isSessionCacheOutdated(cookieSession)) {
        sessionCache = { ...cookieSession }
        renewObservable.notify()
      }
      sessionCache = { ...cookieSession }
    }),
    COOKIE_ACCESS_DELAY
  )

  const cookieWatch = setInterval(() => {
    const cookieSession = retrieveActiveSession(options)
    if (isSessionCacheOutdated(cookieSession)) {
      clearSessionCache()
    }
  }, COOKIE_ACCESS_DELAY)

  function expandSession() {
    const cookieSession = retrieveActiveSession(options)
    if (isSessionCacheOutdated(cookieSession)) {
      clearSessionCache()
    } else {
      persistSession(cookieSession, options)
    }
  }

  function isSessionCacheOutdated(cookieSession: SessionState) {
    return sessionCache.id !== cookieSession.id
  }

  function clearSessionCache() {
    sessionCache = {}
  }

  return {
    expandOrRenewSession,
    expandSession,
    getSession: () => sessionCache,
    renewObservable,
    stop: () => {
      clearInterval(cookieWatch)
    },
  }
}

function isValidSessionString(sessionString: string | undefined): sessionString is string {
  return (
    sessionString !== undefined &&
    (sessionString.indexOf(SESSION_ENTRY_SEPARATOR) !== -1 || SESSION_ENTRY_REGEXP.test(sessionString))
  )
}

function retrieveActiveSession(options: CookieOptions): SessionState {
  const session = retrieveSession()
  if (isActiveSession(session)) {
    return session
  }
  clearSession(options)
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

function retrieveSession(): SessionState {
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

function clearSession(options: CookieOptions) {
  setCookie(SESSION_COOKIE_NAME, '', 0, options)
}

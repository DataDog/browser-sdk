import { CookieOptions, COOKIE_ACCESS_DELAY, setCookie, getCookie } from '../../browser/cookie'
import { Observable } from '../../tools/observable'
import * as utils from '../../tools/utils'
import { monitor, addMonitoringMessage } from '../internalMonitoring'

export interface SessionStore {
  expandOrRenewSession: () => void
  expandSession: () => void
  getSession: () => SessionState
  renewObservable: Observable<void>
  expireObservable: Observable<void>
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

/**
 * Different session concepts:
 * - tracked, the session has an id and is updated along the user navigation
 * - not tracked, the session does not have an id but it is updated along the user navigation
 * - inactive, no session in store or session expired, waiting for a renew session
 */
export function startSessionStore<TrackingType extends string>(
  options: CookieOptions,
  productKey: string,
  computeSessionState: (rawTrackingType?: string) => { trackingType: TrackingType; isTracked: boolean }
): SessionStore {
  const renewObservable = new Observable<void>()
  const expireObservable = new Observable<void>()
  const cookieWatch = setInterval(monitor(retrieveAndSynchronizeSession), COOKIE_ACCESS_DELAY)
  let sessionCache: SessionState = retrieveActiveSession(options)

  function expandOrRenewSession() {
    const cookieSession = retrieveAndSynchronizeSession()
    const isTracked = expandOrRenewCookie(cookieSession)

    if (isTracked && !hasSessionInCache()) {
      renewSession(cookieSession)
    }
    sessionCache = cookieSession
  }

  function expandSession() {
    const cookieSession = retrieveAndSynchronizeSession()
    if (hasSessionInCache()) {
      persistSession(cookieSession, options)
    }
  }

  function retrieveAndSynchronizeSession() {
    const cookieSession = retrieveActiveSession(options)
    if (hasSessionInCache()) {
      if (isSessionInCacheOutdated(cookieSession)) {
        expireSession()
      } else {
        sessionCache = cookieSession
      }
    }
    return cookieSession
  }

  function expandOrRenewCookie(cookieSession: SessionState) {
    const { trackingType, isTracked } = computeSessionState(cookieSession[productKey])
    cookieSession[productKey] = trackingType
    if (isTracked && !cookieSession.id) {
      cookieSession.id = utils.generateUUID()
      cookieSession.created = String(Date.now())
    }
    // save changes and expand session duration
    persistSession(cookieSession, options)
    return isTracked
  }

  function hasSessionInCache() {
    return sessionCache[productKey] !== undefined
  }

  function isSessionInCacheOutdated(cookieSession: SessionState) {
    if (sessionCache.id !== cookieSession.id) {
      if (cookieSession.id && isActiveSession(sessionCache)) {
        // cookie id undefined could be due to cookie expiration
        // inactive session in cache could happen if renew session in another tab and cache not yet cleared
        addSessionInconsistenciesMessage(cookieSession, 'different id')
      }
      return true
    }
    if (sessionCache[productKey] !== cookieSession[productKey]) {
      addSessionInconsistenciesMessage(cookieSession, 'different tracking type')
      return true
    }
    return false
  }

  function addSessionInconsistenciesMessage(cookieSession: SessionState, cause: string) {
    addMonitoringMessage('Session inconsistencies detected', {
      debug: {
        productKey,
        sessionCache,
        cookieSession,
        cause,
      },
    })
  }

  function expireSession() {
    sessionCache = {}
    expireObservable.notify()
  }

  function renewSession(cookieSession: SessionState) {
    sessionCache = cookieSession
    renewObservable.notify()
  }

  return {
    expandOrRenewSession: utils.throttle(monitor(expandOrRenewSession), COOKIE_ACCESS_DELAY).throttled,
    expandSession,
    getSession: () => sessionCache,
    renewObservable,
    expireObservable,
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

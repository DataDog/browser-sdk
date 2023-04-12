import type { CookieOptions } from '../../browser/cookie'
import { COOKIE_ACCESS_DELAY } from '../../browser/cookie'
import { clearInterval, setInterval } from '../../tools/timer'
import { Observable } from '../../tools/observable'
import { dateNow } from '../../tools/utils/timeUtils'
import { throttle } from '../../tools/utils/functionUtils'
import { generateUUID } from '../../tools/utils/stringUtils'
import { SESSION_TIME_OUT_DELAY } from './sessionConstants'
import { deleteSessionCookie, retrieveSessionCookie, withCookieLockAccess } from './sessionCookieStore'

export interface SessionStore {
  expandOrRenewSession: () => void
  expandSession: () => void
  getSession: () => SessionState
  renewObservable: Observable<void>
  expireObservable: Observable<void>
  expire: () => void
  stop: () => void
}

export interface SessionState {
  id?: string
  created?: string
  expire?: string
  lock?: string

  [key: string]: string | undefined
}

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

  const watchSessionTimeoutId = setInterval(watchSession, COOKIE_ACCESS_DELAY)
  let sessionCache: SessionState = retrieveActiveSession()

  function expandOrRenewSession() {
    let isTracked: boolean
    withCookieLockAccess({
      options,
      process: (cookieSession) => {
        const synchronizedSession = synchronizeSession(cookieSession)
        isTracked = expandOrRenewCookie(synchronizedSession)
        return synchronizedSession
      },
      after: (cookieSession) => {
        if (isTracked && !hasSessionInCache()) {
          renewSessionInCache(cookieSession)
        }
        sessionCache = cookieSession
      },
    })
  }

  function expandSession() {
    withCookieLockAccess({
      options,
      process: (cookieSession) => (hasSessionInCache() ? synchronizeSession(cookieSession) : undefined),
    })
  }

  /**
   * allows two behaviors:
   * - if the session is active, synchronize the session cache without updating the session cookie
   * - if the session is not active, clear the session cookie and expire the session cache
   */
  function watchSession() {
    withCookieLockAccess({
      options,
      process: (cookieSession) => (!isActiveSession(cookieSession) ? {} : undefined),
      after: synchronizeSession,
    })
  }

  function synchronizeSession(cookieSession: SessionState) {
    if (!isActiveSession(cookieSession)) {
      cookieSession = {}
    }
    if (hasSessionInCache()) {
      if (isSessionInCacheOutdated(cookieSession)) {
        expireSessionInCache()
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
      cookieSession.id = generateUUID()
      cookieSession.created = String(dateNow())
    }
    return isTracked
  }

  function hasSessionInCache() {
    return sessionCache[productKey] !== undefined
  }

  function isSessionInCacheOutdated(cookieSession: SessionState) {
    return sessionCache.id !== cookieSession.id || sessionCache[productKey] !== cookieSession[productKey]
  }

  function expireSessionInCache() {
    sessionCache = {}
    expireObservable.notify()
  }

  function renewSessionInCache(cookieSession: SessionState) {
    sessionCache = cookieSession
    renewObservable.notify()
  }

  function retrieveActiveSession(): SessionState {
    const session = retrieveSessionCookie()
    if (isActiveSession(session)) {
      return session
    }
    return {}
  }

  function isActiveSession(session: SessionState) {
    // created and expire can be undefined for versions which was not storing them
    // these checks could be removed when older versions will not be available/live anymore
    return (
      (session.created === undefined || dateNow() - Number(session.created) < SESSION_TIME_OUT_DELAY) &&
      (session.expire === undefined || dateNow() < Number(session.expire))
    )
  }

  return {
    expandOrRenewSession: throttle(expandOrRenewSession, COOKIE_ACCESS_DELAY).throttled,
    expandSession,
    getSession: () => sessionCache,
    renewObservable,
    expireObservable,
    expire: () => {
      deleteSessionCookie(options)
      synchronizeSession({})
    },
    stop: () => {
      clearInterval(watchSessionTimeoutId)
    },
  }
}

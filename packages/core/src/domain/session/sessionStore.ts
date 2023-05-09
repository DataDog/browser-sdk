import type { CookieOptions } from '../../browser/cookie'
import { COOKIE_ACCESS_DELAY } from '../../browser/cookie'
import { clearInterval, setInterval } from '../../tools/timer'
import { Observable } from '../../tools/observable'
import { dateNow } from '../../tools/utils/timeUtils'
import { throttle } from '../../tools/utils/functionUtils'
import { generateUUID } from '../../tools/utils/stringUtils'
import { SESSION_TIME_OUT_DELAY } from './sessionConstants'
import { deleteSessionCookie, retrieveSessionCookie, withCookieLockAccess } from './sessionCookieStore'
import type { SessionState } from './sessionStorage'

export interface SessionStore {
  expandOrRenewSession: () => void
  expandSession: () => void
  getSession: () => SessionState
  renewObservable: Observable<void>
  expireObservable: Observable<void>
  expire: () => void
  stop: () => void
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
      process: (sessionState) => {
        const synchronizedSession = synchronizeSession(sessionState)
        isTracked = expandOrRenewCookie(synchronizedSession)
        return synchronizedSession
      },
      after: (sessionState) => {
        if (isTracked && !hasSessionInCache()) {
          renewSessionInCache(sessionState)
        }
        sessionCache = sessionState
      },
    })
  }

  function expandSession() {
    withCookieLockAccess({
      options,
      process: (sessionState) => (hasSessionInCache() ? synchronizeSession(sessionState) : undefined),
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
      process: (sessionState) => (!isActiveSession(sessionState) ? {} : undefined),
      after: synchronizeSession,
    })
  }

  function synchronizeSession(sessionState: SessionState) {
    if (!isActiveSession(sessionState)) {
      sessionState = {}
    }
    if (hasSessionInCache()) {
      if (isSessionInCacheOutdated(sessionState)) {
        expireSessionInCache()
      } else {
        sessionCache = sessionState
      }
    }
    return sessionState
  }

  function expandOrRenewCookie(sessionState: SessionState) {
    const { trackingType, isTracked } = computeSessionState(sessionState[productKey])
    sessionState[productKey] = trackingType
    if (isTracked && !sessionState.id) {
      sessionState.id = generateUUID()
      sessionState.created = String(dateNow())
    }
    return isTracked
  }

  function hasSessionInCache() {
    return sessionCache[productKey] !== undefined
  }

  function isSessionInCacheOutdated(sessionState: SessionState) {
    return sessionCache.id !== sessionState.id || sessionCache[productKey] !== sessionState[productKey]
  }

  function expireSessionInCache() {
    sessionCache = {}
    expireObservable.notify()
  }

  function renewSessionInCache(sessionState: SessionState) {
    sessionCache = sessionState
    renewObservable.notify()
  }

  function retrieveActiveSession(): SessionState {
    const session = retrieveSessionCookie()
    if (isActiveSession(session)) {
      return session
    }
    return {}
  }

  function isActiveSession(sessionDate: SessionState) {
    // created and expire can be undefined for versions which was not storing them
    // these checks could be removed when older versions will not be available/live anymore
    return (
      (sessionDate.created === undefined || dateNow() - Number(sessionDate.created) < SESSION_TIME_OUT_DELAY) &&
      (sessionDate.expire === undefined || dateNow() < Number(sessionDate.expire))
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

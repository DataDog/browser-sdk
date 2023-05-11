import type { CookieOptions } from '../../browser/cookie'
import { COOKIE_ACCESS_DELAY } from '../../browser/cookie'
import { clearInterval, setInterval, setTimeout } from '../../tools/timer'
import { Observable } from '../../tools/observable'
import { dateNow } from '../../tools/utils/timeUtils'
import { throttle } from '../../tools/utils/functionUtils'
import { generateUUID } from '../../tools/utils/stringUtils'
import { SESSION_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY } from './sessionConstants'
import { isCookieLockEnabled, initCookieStorage } from './sessionCookieStore'
import type { SessionState, SessionStorage } from './sessionStorage'
import { isSessionInExpiredState } from './sessionStorage'

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

  const sessionStorage = initCookieStorage(options)
  const { clearSession, retrieveSession } = sessionStorage

  const watchSessionTimeoutId = setInterval(watchSession, COOKIE_ACCESS_DELAY)
  let sessionCache: SessionState = retrieveActiveSession()

  function expandOrRenewSession() {
    let isTracked: boolean
    processStorageOperations(
      {
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
      },
      sessionStorage
    )
  }

  function expandSession() {
    processStorageOperations(
      {
        process: (sessionState) => (hasSessionInCache() ? synchronizeSession(sessionState) : undefined),
      },
      sessionStorage
    )
  }

  /**
   * allows two behaviors:
   * - if the session is active, synchronize the session cache without updating the session cookie
   * - if the session is not active, clear the session cookie and expire the session cache
   */
  function watchSession() {
    processStorageOperations(
      {
        process: (sessionState) => (!isActiveSession(sessionState) ? {} : undefined),
        after: synchronizeSession,
      },
      sessionStorage
    )
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
    const session = retrieveSession()
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
      clearSession()
      synchronizeSession({})
    },
    stop: () => {
      clearInterval(watchSessionTimeoutId)
    },
  }
}

// arbitrary values
export const LOCK_RETRY_DELAY = 10
export const MAX_NUMBER_OF_LOCK_RETRIES = 100

type Operations = {
  process: (cookieSession: SessionState) => SessionState | undefined
  after?: (cookieSession: SessionState) => void
}

const bufferedOperations: Operations[] = []
let ongoingOperations: Operations | undefined

export function processStorageOperations(operations: Operations, sessionStorage: SessionStorage, numberOfRetries = 0) {
  const { retrieveSession, persistSession, clearSession } = sessionStorage

  if (!ongoingOperations) {
    ongoingOperations = operations
  }
  if (operations !== ongoingOperations) {
    bufferedOperations.push(operations)
    return
  }
  if (numberOfRetries >= MAX_NUMBER_OF_LOCK_RETRIES) {
    next(sessionStorage)
    return
  }
  let currentLock: string
  let currentSession = retrieveSession()
  if (isCookieLockEnabled()) {
    // if someone has lock, retry later
    if (currentSession.lock) {
      retryLater(operations, sessionStorage, numberOfRetries)
      return
    }
    // acquire lock
    currentLock = generateUUID()
    currentSession.lock = currentLock
    persistSession(currentSession)
    // if lock is not acquired, retry later
    currentSession = retrieveSession()
    if (currentSession.lock !== currentLock) {
      retryLater(operations, sessionStorage, numberOfRetries)
      return
    }
  }
  let processedSession = operations.process(currentSession)
  if (isCookieLockEnabled()) {
    // if lock corrupted after process, retry later
    currentSession = retrieveSession()
    if (currentSession.lock !== currentLock!) {
      retryLater(operations, sessionStorage, numberOfRetries)
      return
    }
  }
  if (processedSession) {
    if (isSessionInExpiredState(processedSession)) {
      clearSession()
    } else {
      processedSession.expire = String(dateNow() + SESSION_EXPIRATION_DELAY)
      persistSession(processedSession)
    }
  }
  if (isCookieLockEnabled()) {
    // correctly handle lock around expiration would require to handle this case properly at several levels
    // since we don't have evidence of lock issues around expiration, let's just not do the corruption check for it
    if (!(processedSession && isSessionInExpiredState(processedSession))) {
      // if lock corrupted after persist, retry later
      currentSession = retrieveSession()
      if (currentSession.lock !== currentLock!) {
        retryLater(operations, sessionStorage, numberOfRetries)
        return
      }
      delete currentSession.lock
      persistSession(currentSession)
      processedSession = currentSession
    }
  }
  // call after even if session is not persisted in order to perform operations on
  // up-to-date cookie value, the value could have been modified by another tab
  operations.after?.(processedSession || currentSession)
  next(sessionStorage)
}

function retryLater(operations: Operations, sessionStorage: SessionStorage, currentNumberOfRetries: number) {
  setTimeout(() => {
    processStorageOperations(operations, sessionStorage, currentNumberOfRetries + 1)
  }, LOCK_RETRY_DELAY)
}

function next(sessionStorage: SessionStorage) {
  ongoingOperations = undefined
  const nextOperations = bufferedOperations.shift()
  if (nextOperations) {
    processStorageOperations(nextOperations, sessionStorage)
  }
}

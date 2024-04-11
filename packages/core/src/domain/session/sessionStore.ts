import { clearInterval, setInterval } from '../../tools/timer'
import { Observable } from '../../tools/observable'
import { ONE_SECOND, dateNow } from '../../tools/utils/timeUtils'
import { throttle } from '../../tools/utils/functionUtils'
import { generateUUID } from '../../tools/utils/stringUtils'
import type { InitConfiguration } from '../configuration'
import { SESSION_TIME_OUT_DELAY } from './sessionConstants'
import { selectCookieStrategy, initCookieStrategy } from './storeStrategies/sessionInCookie'
import type { SessionStoreStrategyType } from './storeStrategies/sessionStoreStrategy'
import { getInitialSessionState, isSessionInitialized } from './sessionState'
import type { SessionState } from './sessionState'
import { initLocalStorageStrategy, selectLocalStorageStrategy } from './storeStrategies/sessionInLocalStorage'
import { processSessionStoreOperations } from './sessionStoreOperations'

export interface SessionStore {
  expandOrRenewSession: () => void
  expandSession: () => void
  getSession: () => SessionState
  reinitializeSession: () => void
  renewObservable: Observable<void>
  expireObservable: Observable<void>
  expire: () => void
  stop: () => void
}

/**
 * Every second, the storage will be polled to check for any change that can occur
 * to the session state in another browser tab, or another window.
 * This value has been determined from our previous cookie-only implementation.
 */
export const STORAGE_POLL_DELAY = ONE_SECOND

/**
 * Checks if cookies are available as the preferred storage
 * Else, checks if LocalStorage is allowed and available
 */
export function selectSessionStoreStrategyType(
  initConfiguration: InitConfiguration
): SessionStoreStrategyType | undefined {
  let sessionStoreStrategyType = selectCookieStrategy(initConfiguration)
  if (!sessionStoreStrategyType && initConfiguration.allowFallbackToLocalStorage) {
    sessionStoreStrategyType = selectLocalStorageStrategy()
  }
  return sessionStoreStrategyType
}

/**
 * Different session concepts:
 * - tracked, the session has an id and is updated along the user navigation
 * - not tracked, the session does not have an id but it is updated along the user navigation
 * - inactive, no session in store or session expired, waiting for a renew session
 */
export function startSessionStore<TrackingType extends string>(
  sessionStoreStrategyType: SessionStoreStrategyType,
  productKey: string,
  computeSessionState: (rawTrackingType?: string) => { trackingType: TrackingType; isTracked: boolean }
): SessionStore {
  const renewObservable = new Observable<void>()
  const expireObservable = new Observable<void>()

  const sessionStoreStrategy =
    sessionStoreStrategyType.type === 'Cookie'
      ? initCookieStrategy(sessionStoreStrategyType.cookieOptions)
      : initLocalStorageStrategy()
  const { clearSession, retrieveSession } = sessionStoreStrategy

  const watchSessionTimeoutId = setInterval(watchSession, STORAGE_POLL_DELAY)
  let sessionCache: SessionState = retrieveActiveSession()

  const { throttled: throttledExpandOrRenewSession, cancel: cancelExpandOrRenewSession } = throttle(() => {
    let isTracked: boolean
    processSessionStoreOperations(
      {
        process: (sessionState) => {
          const synchronizedSession = synchronizeSession(sessionState)
          isTracked = expandOrRenewSessionState(synchronizedSession)
          return synchronizedSession
        },
        after: (sessionState) => {
          if (isTracked && !hasSessionInCache()) {
            renewSessionInCache(sessionState)
          }
          sessionCache = sessionState
        },
      },
      sessionStoreStrategy
    )
  }, STORAGE_POLL_DELAY)

  function expandSession() {
    processSessionStoreOperations(
      {
        process: (sessionState) => (hasSessionInCache() ? synchronizeSession(sessionState) : undefined),
      },
      sessionStoreStrategy
    )
  }

  /**
   * allows two behaviors:
   * - if the session is active, synchronize the session cache without updating the session store
   * - if the session is not active, clear the session store and expire the session cache
   */
  function watchSession() {
    processSessionStoreOperations(
      {
        process: (sessionState) =>
          isSessionInitialized(sessionState) && !isActiveSession(sessionState) ? getInitialSessionState() : undefined,
        after: synchronizeSession,
      },
      sessionStoreStrategy
    )
  }

  function synchronizeSession(sessionState: SessionState) {
    if (!isSessionInitialized(sessionState)) {
      expireSessionInCache()
      return sessionState
    }

    if (!isActiveSession(sessionState)) {
      sessionState = getInitialSessionState()
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

  function reinitializeSession() {
    processSessionStoreOperations(
      {
        process: (sessionState) => {
          if (!isSessionInitialized(sessionState)) {
            return getInitialSessionState()
          }
        },
        after: synchronizeSession,
      },
      sessionStoreStrategy
    )
  }

  function expandOrRenewSessionState(sessionState: SessionState) {
    if (!isSessionInitialized(sessionState)) {
      return false
    }

    const { trackingType, isTracked } = computeSessionState(sessionState[productKey])
    sessionState[productKey] = trackingType
    if (isTracked && !sessionState.id) {
      sessionState.id = generateUUID()
      sessionState.created = String(dateNow())
      delete sessionState.isExpired
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
    sessionCache = getInitialSessionState()

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
    return getInitialSessionState()
  }

  function isActiveSession(sessionState: SessionState) {
    // created and expire can be undefined for versions which was not storing them
    // these checks could be removed when older versions will not be available/live anymore
    return (
      (sessionState.created === undefined || dateNow() - Number(sessionState.created) < SESSION_TIME_OUT_DELAY) &&
      (sessionState.expire === undefined || dateNow() < Number(sessionState.expire))
    )
  }

  return {
    expandOrRenewSession: throttledExpandOrRenewSession,
    expandSession,
    getSession: () => sessionCache,
    renewObservable,
    expireObservable,
    reinitializeSession,
    expire: () => {
      cancelExpandOrRenewSession()
      clearSession()
      synchronizeSession(getInitialSessionState())
    },
    stop: () => {
      clearInterval(watchSessionTimeoutId)
    },
  }
}

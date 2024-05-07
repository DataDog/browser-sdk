import { clearInterval, setInterval } from '../../tools/timer'
import { Observable } from '../../tools/observable'
import { ONE_SECOND, dateNow } from '../../tools/utils/timeUtils'
import { throttle } from '../../tools/utils/functionUtils'
import { generateUUID } from '../../tools/utils/stringUtils'
import type { InitConfiguration } from '../configuration'
import { assign } from '../../tools/utils/polyfills'
import { selectCookieStrategy, initCookieStrategy } from './storeStrategies/sessionInCookie'
import type { SessionStoreStrategyType } from './storeStrategies/sessionStoreStrategy'
import { getExpiredSessionState, isSessionInExpiredState, isSessionInNotStartedState } from './sessionState'
import type { SessionState } from './sessionState'
import { initLocalStorageStrategy, selectLocalStorageStrategy } from './storeStrategies/sessionInLocalStorage'
import { processSessionStoreOperations } from './sessionStoreOperations'

export interface SessionStore {
  expandOrRenewSession: () => void
  expandSession: () => void
  getSession: () => SessionState
  restartSession: () => void
  renewObservable: Observable<void>
  expireObservable: Observable<void>
  trackingUpdateObservable: Observable<void>
  expire: () => void
  stop: () => void
  updateSession: (state: Partial<SessionState>) => void
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
  computeSessionState: (rawTrackingType?: string) => { trackingType: TrackingType; isTracked: boolean },
  allowedTrackingTransition?: TrackingType
): SessionStore {
  const renewObservable = new Observable<void>()
  const expireObservable = new Observable<void>()
  const trackingUpdateObservable = new Observable<void>()

  const sessionStoreStrategy =
    sessionStoreStrategyType.type === 'Cookie'
      ? initCookieStrategy(sessionStoreStrategyType.cookieOptions)
      : initLocalStorageStrategy()
  const { expireSession } = sessionStoreStrategy

  const watchSessionTimeoutId = setInterval(watchSession, STORAGE_POLL_DELAY)
  let sessionCache: SessionState

  startSession()

  const { throttled: throttledExpandOrRenewSession, cancel: cancelExpandOrRenewSession } = throttle(() => {
    let isTracked: boolean
    processSessionStoreOperations(
      {
        process: (sessionState) => {
          if (isSessionInNotStartedState(sessionState)) {
            return
          }

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
        process: (sessionState) => (isSessionInExpiredState(sessionState) ? getExpiredSessionState() : undefined),
        after: synchronizeSession,
      },
      sessionStoreStrategy
    )
  }

  function synchronizeSession(sessionState: SessionState) {
    if (isSessionInExpiredState(sessionState)) {
      sessionState = getExpiredSessionState()
    }
    if (hasSessionInCache()) {
      if (isSessionInCacheOutdated(sessionState)) {
        expireSessionInCache()
      } else {
        if (
          allowedTrackingTransition &&
          sessionState[productKey] === allowedTrackingTransition &&
          sessionState[productKey] !== sessionCache[productKey]
        ) {
          trackingUpdateObservable.notify()
        }
        sessionCache = sessionState
      }
    }
    return sessionState
  }

  function startSession() {
    processSessionStoreOperations(
      {
        process: (sessionState) => {
          if (isSessionInNotStartedState(sessionState)) {
            return getExpiredSessionState()
          }
        },
        after: (sessionState) => {
          sessionCache = sessionState
        },
      },
      sessionStoreStrategy
    )
  }

  function expandOrRenewSessionState(sessionState: SessionState) {
    if (isSessionInNotStartedState(sessionState)) {
      return false
    }

    const { trackingType, isTracked } = computeSessionState(sessionState[productKey])
    sessionState[productKey] = trackingType
    delete sessionState.isExpired
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
    const didSessionIdChange = sessionCache.id !== sessionState.id
    const didSessionTrackingChange = sessionCache[productKey] !== sessionState[productKey]
    const untoleratedTrackingChange =
      (!allowedTrackingTransition && didSessionTrackingChange) ||
      (allowedTrackingTransition && sessionState[productKey] !== allowedTrackingTransition && didSessionTrackingChange)

    const a = didSessionIdChange || untoleratedTrackingChange
    return a
  }

  function expireSessionInCache() {
    sessionCache = getExpiredSessionState()
    expireObservable.notify()
  }

  function renewSessionInCache(sessionState: SessionState) {
    sessionCache = sessionState
    renewObservable.notify()
  }

  function updateSession(updatedState: Partial<SessionState>) {
    processSessionStoreOperations(
      {
        process: (sessionState) => assign({}, sessionState, updatedState),
        after: synchronizeSession,
      },
      sessionStoreStrategy
    )
  }

  return {
    expandOrRenewSession: throttledExpandOrRenewSession,
    expandSession,
    getSession: () => sessionCache,
    renewObservable,
    expireObservable,
    trackingUpdateObservable,
    restartSession: startSession,
    expire: () => {
      cancelExpandOrRenewSession()
      expireSession()
      synchronizeSession(getExpiredSessionState())
    },
    stop: () => {
      clearInterval(watchSessionTimeoutId)
    },
    updateSession,
  }
}

import { clearInterval, setInterval } from '../../tools/timer'
import { Observable } from '../../tools/observable'
import { ONE_SECOND, dateNow } from '../../tools/utils/timeUtils'
import { throttle } from '../../tools/utils/functionUtils'
import { generateUUID } from '../../tools/utils/stringUtils'
import type { InitConfiguration, Configuration } from '../configuration'
import { display } from '../../tools/display'
import { selectCookieStrategy, initCookieStrategy } from './storeStrategies/sessionInCookie'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './storeStrategies/sessionStoreStrategy'
import type { SessionState } from './sessionState'
import {
  getExpiredSessionState,
  isSessionInExpiredState,
  isSessionInNotStartedState,
  isSessionStarted,
} from './sessionState'
import { initLocalStorageStrategy, selectLocalStorageStrategy } from './storeStrategies/sessionInLocalStorage'
import { processSessionStoreOperations } from './sessionStoreOperations'
import { SESSION_NOT_TRACKED, SessionPersistence } from './sessionConstants'
import { initMemorySessionStoreStrategy, selectMemorySessionStoreStrategy } from './storeStrategies/sessionInMemory'

export interface SessionStore {
  expandOrRenewSession: () => void
  expandSession: () => void
  getSession: () => SessionState
  restartSession: () => void
  renewObservable: Observable<void>
  expireObservable: Observable<void>
  sessionStateUpdateObservable: Observable<{ previousState: SessionState; newState: SessionState }>
  expire: (hasConsent?: boolean) => void
  stop: () => void
  updateSessionState: (state: Partial<SessionState>) => void
}

/**
 * Every second, the storage will be polled to check for any change that can occur
 * to the session state in another browser tab, or another window.
 * This value has been determined from our previous cookie-only implementation.
 */
export const STORAGE_POLL_DELAY = ONE_SECOND

/**
 * Selects the correct session store strategy type based on the configuration and storage
 * availability. When an array is provided, tries each persistence type in order until one
 * successfully initializes.
 */
export function selectSessionStoreStrategyType(
  initConfiguration: InitConfiguration
): SessionStoreStrategyType | undefined {
  const { sessionPersistence } = initConfiguration

  const persistenceList = normalizePersistenceList(sessionPersistence, initConfiguration)

  for (const persistence of persistenceList) {
    const strategyType = selectStrategyForPersistence(persistence, initConfiguration)
    if (strategyType !== undefined) {
      return strategyType
    }
  }

  return undefined
}

function normalizePersistenceList(
  sessionPersistence: SessionPersistence | SessionPersistence[] | undefined,
  initConfiguration: InitConfiguration
): SessionPersistence[] {
  if (Array.isArray(sessionPersistence)) {
    return sessionPersistence
  }

  if (sessionPersistence !== undefined) {
    return [sessionPersistence]
  }

  // Legacy default behavior: cookie first, with optional localStorage fallback
  return initConfiguration.allowFallbackToLocalStorage
    ? [SessionPersistence.COOKIE, SessionPersistence.LOCAL_STORAGE]
    : [SessionPersistence.COOKIE]
}

function selectStrategyForPersistence(
  persistence: SessionPersistence,
  initConfiguration: InitConfiguration
): SessionStoreStrategyType | undefined {
  switch (persistence) {
    case SessionPersistence.COOKIE:
      return selectCookieStrategy(initConfiguration)

    case SessionPersistence.LOCAL_STORAGE:
      return selectLocalStorageStrategy()

    case SessionPersistence.MEMORY:
      return selectMemorySessionStoreStrategy()

    default:
      display.error(`Invalid session persistence '${String(persistence)}'`)
      return undefined
  }
}

export function getSessionStoreStrategy(
  sessionStoreStrategyType: SessionStoreStrategyType,
  configuration: Configuration
) {
  return sessionStoreStrategyType.type === SessionPersistence.COOKIE
    ? initCookieStrategy(configuration, sessionStoreStrategyType.cookieOptions)
    : sessionStoreStrategyType.type === SessionPersistence.LOCAL_STORAGE
      ? initLocalStorageStrategy(configuration)
      : initMemorySessionStoreStrategy(configuration)
}

/**
 * Different session concepts:
 * - tracked, the session has an id and is updated along the user navigation
 * - not tracked, the session does not have an id but it is updated along the user navigation
 * - inactive, no session in store or session expired, waiting for a renew session
 */
export function startSessionStore<TrackingType extends string>(
  sessionStoreStrategyType: SessionStoreStrategyType,
  configuration: Configuration,
  productKey: string,
  computeTrackingType: (rawTrackingType?: string) => TrackingType,
  sessionStoreStrategy: SessionStoreStrategy = getSessionStoreStrategy(sessionStoreStrategyType, configuration)
): SessionStore {
  const renewObservable = new Observable<void>()
  const expireObservable = new Observable<void>()
  const sessionStateUpdateObservable = new Observable<{ previousState: SessionState; newState: SessionState }>()

  const watchSessionTimeoutId = setInterval(watchSession, STORAGE_POLL_DELAY)
  let sessionCache: SessionState

  startSession()

  const { throttled: throttledExpandOrRenewSession, cancel: cancelExpandOrRenewSession } = throttle(() => {
    processSessionStoreOperations(
      {
        process: (sessionState) => {
          if (isSessionInNotStartedState(sessionState)) {
            return
          }

          const synchronizedSession = synchronizeSession(sessionState)
          expandOrRenewSessionState(synchronizedSession)
          return synchronizedSession
        },
        after: (sessionState) => {
          if (isSessionStarted(sessionState) && !hasSessionInCache()) {
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
    const sessionState = sessionStoreStrategy.retrieveSession()

    if (isSessionInExpiredState(sessionState)) {
      processSessionStoreOperations(
        {
          process: (sessionState: SessionState) =>
            isSessionInExpiredState(sessionState) ? getExpiredSessionState(sessionState, configuration) : undefined,
          after: synchronizeSession,
        },
        sessionStoreStrategy
      )
    } else {
      synchronizeSession(sessionState)
    }
  }

  function synchronizeSession(sessionState: SessionState) {
    if (isSessionInExpiredState(sessionState)) {
      sessionState = getExpiredSessionState(sessionState, configuration)
    }
    if (hasSessionInCache()) {
      if (isSessionInCacheOutdated(sessionState)) {
        expireSessionInCache()
      } else {
        sessionStateUpdateObservable.notify({ previousState: sessionCache, newState: sessionState })
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
            sessionState.anonymousId = generateUUID()
            return getExpiredSessionState(sessionState, configuration)
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

    const trackingType = computeTrackingType(sessionState[productKey])
    sessionState[productKey] = trackingType
    delete sessionState.isExpired
    if (trackingType !== SESSION_NOT_TRACKED && !sessionState.id) {
      sessionState.id = generateUUID()
      sessionState.created = String(dateNow())
    }
    if (configuration.trackAnonymousUser && !sessionState.anonymousId) {
      sessionState.anonymousId = generateUUID()
    }
  }

  function hasSessionInCache() {
    return sessionCache?.[productKey] !== undefined
  }

  function isSessionInCacheOutdated(sessionState: SessionState) {
    return sessionCache.id !== sessionState.id || sessionCache[productKey] !== sessionState[productKey]
  }

  function expireSessionInCache() {
    sessionCache = getExpiredSessionState(sessionCache, configuration)
    expireObservable.notify()
  }

  function renewSessionInCache(sessionState: SessionState) {
    sessionCache = sessionState
    renewObservable.notify()
  }

  function updateSessionState(partialSessionState: Partial<SessionState>) {
    processSessionStoreOperations(
      {
        process: (sessionState) => ({ ...sessionState, ...partialSessionState }),
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
    sessionStateUpdateObservable,
    restartSession: startSession,
    expire: (hasConsent?: boolean) => {
      cancelExpandOrRenewSession()
      if (hasConsent === false && sessionCache) {
        delete sessionCache.anonymousId
      }
      sessionStoreStrategy.expireSession(sessionCache)
      synchronizeSession(getExpiredSessionState(sessionCache, configuration))
    },
    stop: () => {
      clearInterval(watchSessionTimeoutId)
    },
    updateSessionState,
  }
}

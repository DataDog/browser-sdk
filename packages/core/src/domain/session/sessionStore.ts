import { clearInterval, setInterval } from '../../tools/timer'
import { Observable } from '../../tools/observable'
import { ONE_SECOND, dateNow } from '../../tools/utils/timeUtils'
import { throttle } from '../../tools/utils/functionUtils'
import { generateUUID } from '../../tools/utils/stringUtils'
import type { InitConfiguration, Configuration } from '../configuration'
import { display } from '../../tools/display'
import { isWorkerEnvironment } from '../../tools/globalObject'
import { selectCookieStrategy, initCookieStrategy } from './storeStrategies/sessionInCookie'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './storeStrategies/sessionStoreStrategy'
import type { SessionState } from './sessionState'
import {
  expandSessionState,
  getExpiredSessionState,
  isSessionInExpiredState,
  isSessionInNotStartedState,
  isSessionStarted,
} from './sessionState'
import { initLocalStorageStrategy, selectLocalStorageStrategy } from './storeStrategies/sessionInLocalStorage'
import { withSessionLock } from './sessionLock'
import { SessionPersistence } from './sessionConstants'
import { initMemorySessionStoreStrategy, selectMemorySessionStoreStrategy } from './storeStrategies/sessionInMemory'

export interface SessionStore {
  expandOrRenewSession: (callback?: () => void) => void
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
  const persistenceList = normalizePersistenceList(initConfiguration.sessionPersistence, initConfiguration)

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

  // In worker environments, default to memory since cookie and localStorage are not available
  // TODO: make it work when we start using Cookie Store API
  // @see https://developer.mozilla.org/en-US/docs/Web/API/CookieStore
  if (isWorkerEnvironment) {
    return [SessionPersistence.MEMORY]
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
export function startSessionStore(
  sessionStoreStrategyType: SessionStoreStrategyType,
  configuration: Configuration,
  sessionStoreStrategy: SessionStoreStrategy = getSessionStoreStrategy(sessionStoreStrategyType, configuration)
): SessionStore {
  const renewObservable = new Observable<void>()
  const expireObservable = new Observable<void>()
  const sessionStateUpdateObservable = new Observable<{ previousState: SessionState; newState: SessionState }>()

  const watchSessionTimeoutId = setInterval(watchSession, STORAGE_POLL_DELAY)
  let sessionCache: SessionState

  const { throttled: throttledExpandOrRenewSession, cancel: cancelExpandOrRenewSession } = throttle(
    (callback?: () => void) => {
      withSessionLock(() => {
        const sessionState = sessionStoreStrategy.retrieveSession()
        if (isSessionInNotStartedState(sessionState)) {
          return
        }
        const synchronizedSession = synchronizeSession(sessionState)
        expandOrRenewSessionState(synchronizedSession)
        expandSessionState(synchronizedSession)
        sessionStoreStrategy.persistSession(synchronizedSession)

        if (isSessionStarted(synchronizedSession) && !hasSessionInCache()) {
          renewSessionInCache(synchronizedSession)
        }
        sessionCache = synchronizedSession
        callback?.()
      })
    },
    STORAGE_POLL_DELAY
  )

  startSession()

  function expandSession() {
    withSessionLock(() => {
      if (!hasSessionInCache()) {
        return
      }
      const sessionState = sessionStoreStrategy.retrieveSession()
      const synced = synchronizeSession(sessionState)
      if (isSessionInExpiredState(synced)) {
        sessionStoreStrategy.expireSession(synced)
      } else {
        expandSessionState(synced)
        sessionStoreStrategy.persistSession(synced)
      }
    })
  }

  /**
   * allows two behaviors:
   * - if the session is active, synchronize the session cache without updating the session store
   * - if the session is not active, clear the session store and expire the session cache
   */
  function watchSession() {
    withSessionLock(() => {
      const sessionState = sessionStoreStrategy.retrieveSession()
      if (isSessionInExpiredState(sessionState)) {
        const expired = getExpiredSessionState(sessionState, configuration)
        sessionStoreStrategy.expireSession(expired)
        synchronizeSession(expired)
      } else {
        synchronizeSession(sessionState)
      }
    })
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
    withSessionLock(() => {
      const sessionState = sessionStoreStrategy.retrieveSession()
      if (isSessionInNotStartedState(sessionState)) {
        sessionState.anonymousId = generateUUID()
        const expired = getExpiredSessionState(sessionState, configuration)
        sessionStoreStrategy.expireSession(expired)
        sessionCache = expired
      } else {
        sessionCache = sessionState
      }
    })
  }

  function expandOrRenewSessionState(sessionState: SessionState) {
    if (isSessionInNotStartedState(sessionState)) {
      return false
    }

    // Always store session ID for deterministic sampling
    if (!sessionState.id) {
      sessionState.id = generateUUID()
      sessionState.created = String(dateNow())
    }
    if (configuration.trackAnonymousUser && !sessionState.anonymousId) {
      sessionState.anonymousId = generateUUID()
    }

    delete sessionState.isExpired
  }

  function hasSessionInCache() {
    return sessionCache?.id !== undefined
  }

  function isSessionInCacheOutdated(sessionState: SessionState) {
    return sessionCache.id !== sessionState.id
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
    withSessionLock(() => {
      const sessionState = sessionStoreStrategy.retrieveSession()
      const updated = { ...sessionState, ...partialSessionState }
      expandSessionState(updated)
      sessionStoreStrategy.persistSession(updated)
      synchronizeSession(updated)
    })
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

import { SessionStoreStrategy, SessionStoreStrategyType, SESSION_STORE_KEY } from './sessionStoreStrategy'
import { SessionState, toSessionString, toSessionState, getExpiredSessionState } from '../sessionState'
import { SessionPersistence } from '../sessionConstants'
import type { Configuration } from '../../configuration'

const CACHE_NAME = 'session-cache'

// In-memory copy of the session string. This enables us to return a session synchronously.
let inMemorySessionString: string | null = null

/**
 * Attempts to load the session from the Cache API asynchronously.
 * This is invoked during initialization so that subsequent calls to retrieveSession
 * return the cached session data if available.
 */
function loadSessionFromCache(): void {
  if (!('caches' in window)) {
    return
  }
  caches
    .open(CACHE_NAME)
    .then((cache) => cache.match(SESSION_STORE_KEY))
    .then((response) => {
      if (response) {
        return response.text()
      }
      return null
    })
    .then((sessionStr) => {
      inMemorySessionString = sessionStr
    })
    .catch((error) => {
      console.error('Failed to load session from Cache API', error)
    })
}

/**
 * Persists the given session state.
 * The session is converted to a string (using toSessionString) and stored
 * in-memory for synchronous access while the Cache API is updated asynchronously.
 */
function persistInCache(sessionState: SessionState): void {
  inMemorySessionString = toSessionString(sessionState)
  if (!('caches' in window)) {
    return
  }
  caches
    .open(CACHE_NAME)
    .then((cache) => cache.put(SESSION_STORE_KEY, new Response(inMemorySessionString!)))
    .catch((error) => {
      console.error('Failed to persist session to Cache API', error)
    })
}

/**
 * Retrieves the session state.
 * Returns the session from the in-memory copy. If none is available, toSessionState
 * will convert a null/empty value into a default session state.
 */
function retrieveFromCache(): SessionState {
  return toSessionState(inMemorySessionString)
}

/**
 * Expires the current session by calculating the expired session state
 * (using getExpiredSessionState) and then updating both the in-memory copy and
 * the Cache API asynchronously.
 */
function expireInCache(sessionState: SessionState, configuration: Configuration): void {
  const expiredSession = getExpiredSessionState(sessionState, configuration)
  inMemorySessionString = toSessionString(expiredSession)
  if (!('caches' in window)) {
    return
  }
  caches
    .open(CACHE_NAME)
    .then((cache) => cache.put(SESSION_STORE_KEY, new Response(inMemorySessionString!)))
    .catch((error) => {
      console.error('Failed to expire session in Cache API', error)
    })
}

/**
 * Checks if the Cache API is available in the current environment.
 * Returns a strategy type if available.
 */
export function selectNewStrategy(): SessionStoreStrategyType | undefined {
  if ('caches' in window) {
    return { type: SessionPersistence.SERVICE_WORKER }
  }
  return undefined
}

/**
 * Initializes the new Service Worker (Cache API) session storage strategy.
 * It loads any pre-existing session from the Cache API into an in-memory variable,
 * then returns an object implementing SessionStoreStrategy.
 */
export function initNewStrategy(configuration: Configuration): SessionStoreStrategy {
  loadSessionFromCache()

  return {
    isLockEnabled: false,
    persistSession: persistInCache,
    retrieveSession: retrieveFromCache,
    expireSession: (sessionState: SessionState) => expireInCache(sessionState, configuration),
  }
}

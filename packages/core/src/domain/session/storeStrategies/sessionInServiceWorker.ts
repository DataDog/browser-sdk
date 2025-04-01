import { SessionStoreStrategy, SessionStoreStrategyType, SESSION_STORE_KEY } from './sessionStoreStrategy'
import { SessionState, toSessionString, toSessionState, getExpiredSessionState } from '../sessionState'
import { SessionPersistence } from '../sessionConstants'
import type { Configuration } from '../../configuration'

const CACHE_NAME = 'session-cache-v1'

// In-memory copy of the session string for synchronous access
let inMemorySessionString: string | null = null

export function selectServiceWorkerStrategy(): SessionStoreStrategyType | undefined {
  const isServiceWorker = typeof self !== 'undefined' && 'ServiceWorkerGlobalScope' in self
  
  if (typeof caches !== 'undefined') {
    return { type: SessionPersistence.SERVICE_WORKER }
  }
  
  if (isServiceWorker && typeof self.caches !== 'undefined') {
    return { type: SessionPersistence.SERVICE_WORKER }
  }
  
  if (typeof window !== 'undefined' && typeof window.caches !== 'undefined') {
    return { type: SessionPersistence.SERVICE_WORKER }
  }
  
  return undefined
}

export function initServiceWorkerStrategy(configuration: Configuration): SessionStoreStrategy {
  loadSessionFromCache()

  return {
    isLockEnabled: false,
    persistSession: (sessionState: SessionState) => {
      persistInCache(sessionState)
    },
    retrieveSession: retrieveFromCache,
    expireSession: (sessionState: SessionState) => {
      expireInCache(sessionState, configuration)
    },
  }
}

/**
 * Attempts to load the session from the Cache API asynchronously.
 * This is invoked during initialization so that subsequent calls to retrieveSession
 * return the cached session data if available.
 */
async function loadSessionFromCache(): Promise<void> {
  if (typeof caches === 'undefined') {
    return
  }

  try {
    const cache = await caches.open(CACHE_NAME)
    const response = await cache.match(SESSION_STORE_KEY)
    if (response) {
      inMemorySessionString = await response.text()
    }
  } catch (error) {
    console.error('Failed to load session from Cache API:', error)
  }
}

async function persistInCache(sessionState: SessionState): Promise<void> {
  const sessionString = toSessionString(sessionState)
  inMemorySessionString = sessionString

  if (typeof caches === 'undefined') {
    return
  }

  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(SESSION_STORE_KEY, new Response(sessionString))
  } catch (error) {
    console.error('Failed to persist session to Cache API:', error)
  }
}

function retrieveFromCache(): SessionState {
  return toSessionState(inMemorySessionString)
}

async function expireInCache(sessionState: SessionState, configuration: Configuration): Promise<void> {
  const expiredSession = getExpiredSessionState(sessionState, configuration)
  await persistInCache(expiredSession)
}

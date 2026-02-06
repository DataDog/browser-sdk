import { getGlobalObject } from '../../../tools/globalObject'
import { SessionPersistence } from '../sessionConstants'
import type { SessionState } from '../sessionState'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'

/**
 * Key used to store session state in the global object.
 * This allows RUM and Logs SDKs to share the same session when using in-memory storage.
 */
export const IN_MEMORY_SESSION_STORE_KEY = '_DD_SESSION'

interface GlobalObjectWithSession {
  [IN_MEMORY_SESSION_STORE_KEY]?: SessionState
}

function getSessionStore(): SessionState {
  const globalObject = getGlobalObject<GlobalObjectWithSession>()
  if (!globalObject[IN_MEMORY_SESSION_STORE_KEY]) {
    globalObject[IN_MEMORY_SESSION_STORE_KEY] = {}
  }
  return globalObject[IN_MEMORY_SESSION_STORE_KEY]
}

function setSessionStore(state: SessionState): void {
  const globalObject = getGlobalObject<GlobalObjectWithSession>()
  globalObject[IN_MEMORY_SESSION_STORE_KEY] = state
}

export function selectInMemorySessionStoreStrategy(): SessionStoreStrategyType {
  return { type: SessionPersistence.IN_MEMORY }
}

export function initInMemorySessionStoreStrategy(): SessionStoreStrategy {
  return {
    expireSession: () => setSessionStore({ isExpired: '1' }),
    isLockEnabled: false,
    persistSession: (newState: SessionState) => setSessionStore({ ...newState }),
    retrieveSession: () => ({ ...getSessionStore() }),
  }
}

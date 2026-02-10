import { getGlobalObject } from '../../../tools/globalObject'
import type { Configuration } from '../../configuration'
import { SessionPersistence } from '../sessionConstants'
import type { SessionState } from '../sessionState'
import { getExpiredSessionState } from '../sessionState'
import { shallowClone } from '../../../tools/utils/objectUtils'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'

/**
 * Key used to store session state in the global object.
 * This allows RUM and Logs SDKs to share the same session when using memory storage.
 */
export const MEMORY_SESSION_STORE_KEY = '_DD_SESSION'

interface GlobalObjectWithSession {
  [MEMORY_SESSION_STORE_KEY]?: SessionState
}

export function selectMemorySessionStoreStrategy(): SessionStoreStrategyType {
  return { type: SessionPersistence.MEMORY }
}

export function initMemorySessionStoreStrategy(configuration: Configuration): SessionStoreStrategy {
  return {
    expireSession: (sessionState: SessionState) => expireSessionFromMemory(sessionState, configuration),
    isLockEnabled: false,
    persistSession: persistInMemory,
    retrieveSession: retrieveFromMemory,
  }
}

function retrieveFromMemory(): SessionState {
  const globalObject = getGlobalObject<GlobalObjectWithSession>()
  if (!globalObject[MEMORY_SESSION_STORE_KEY]) {
    globalObject[MEMORY_SESSION_STORE_KEY] = {}
  }
  return shallowClone(globalObject[MEMORY_SESSION_STORE_KEY])
}

function persistInMemory(state: SessionState): void {
  const globalObject = getGlobalObject<GlobalObjectWithSession>()
  globalObject[MEMORY_SESSION_STORE_KEY] = shallowClone(state)
}

function expireSessionFromMemory(previousSessionState: SessionState, configuration: Configuration) {
  persistInMemory(getExpiredSessionState(previousSessionState, configuration))
}

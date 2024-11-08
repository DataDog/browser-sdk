import { SessionPersistence } from '../sessionConstants'
import type { SessionState } from '../sessionState'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'

let inMemorySessionState: SessionState = {}

const expireSession = () => (inMemorySessionState = inMemorySessionState = { isExpired: '1' })
const persistSession = (newState: SessionState) => (inMemorySessionState = Object.assign({}, newState))
const retrieveSession = () => inMemorySessionState

export function selectInMemorySessionStoreStrategy(): SessionStoreStrategyType {
  return { type: SessionPersistence.IN_MEMORY }
}

export function initInMemorySessionStoreStrategy(): SessionStoreStrategy {
  return {
    expireSession,
    isLockEnabled: false,
    persistSession,
    retrieveSession,
  }
}

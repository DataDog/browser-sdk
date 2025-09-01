import { SessionPersistence } from '../sessionConstants'
import type { SessionState } from '../sessionState'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'

export function selectMockStrategy(): SessionStoreStrategyType | undefined {
  return { type: SessionPersistence.NONE }
}

function noop() {
  // Empty
}

export function initMockStrategy(): SessionStoreStrategy {
  return {
    isLockEnabled: false,
    persistSession: noop,
    retrieveSession: retrieveMock,
    expireSession: noop,
  }
}

function retrieveMock(): SessionState {
  return {}
}

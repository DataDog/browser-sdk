import type { SessionState } from '../sessionState'
import type { SessionStoreStrategy } from './sessionStoreStrategy'

let inMemorySessionState: SessionState = {}

const expireSession = () => (inMemorySessionState = inMemorySessionState = { isExpired: '1' })
const persistSession = (newState: SessionState) => (inMemorySessionState = Object.assign({}, newState))
const retrieveSession = () => inMemorySessionState

export function initInMemorySessionStoreStrategy(): SessionStoreStrategy {
  return {
    expireSession,
    isLockEnabled: false,
    persistSession,
    retrieveSession,
  }
}

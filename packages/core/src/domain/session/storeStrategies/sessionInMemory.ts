import { getGlobalObject } from '../../../tools/globalObject'
import { Observable } from '../../../tools/observable'
import { SessionPersistence } from '../sessionConstants'
import type { SessionState } from '../sessionState'
import { shallowClone } from '../../../tools/utils/objectUtils'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'

export const MEMORY_SESSION_STORE_KEY = '_DD_SESSION'
const MEMORY_SESSION_OBSERVABLE_KEY = '_DD_SESSION_OBSERVABLE'

interface GlobalObjectWithSession {
  [MEMORY_SESSION_STORE_KEY]?: SessionState
  [MEMORY_SESSION_OBSERVABLE_KEY]?: Observable<SessionState>
}

export function selectMemorySessionStoreStrategy(): SessionStoreStrategyType {
  return { type: SessionPersistence.MEMORY }
}

export function initMemorySessionStoreStrategy(): SessionStoreStrategy {
  const globalObject = getGlobalObject<GlobalObjectWithSession>()

  // Share the observable across SDK instances (RUM + Logs)
  if (!globalObject[MEMORY_SESSION_OBSERVABLE_KEY]) {
    globalObject[MEMORY_SESSION_OBSERVABLE_KEY] = new Observable<SessionState>()
  }
  const sessionObservable = globalObject[MEMORY_SESSION_OBSERVABLE_KEY]

  return {
    setSessionState(fn: (sessionState: SessionState) => SessionState): void {
      const currentState = globalObject[MEMORY_SESSION_STORE_KEY]
        ? shallowClone(globalObject[MEMORY_SESSION_STORE_KEY])
        : {}
      const newState = fn(currentState)
      globalObject[MEMORY_SESSION_STORE_KEY] = shallowClone(newState)
      sessionObservable.notify(shallowClone(newState))
    },
    sessionObservable,
  }
}

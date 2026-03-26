import { getGlobalObject } from '../../../tools/globalObject'
import { Observable } from '../../../tools/observable'
import { shallowClone } from '../../../tools/utils/objectUtils'
import { SessionPersistence } from '../sessionConstants'
import type { SessionState } from '../sessionState'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'

export const MEMORY_SESSION_STORE_KEY = '_DD_SESSION'

interface MemorySession {
  state?: SessionState
  onChange?: (state: SessionState) => void
}

interface GlobalObjectWithSession {
  [MEMORY_SESSION_STORE_KEY]?: MemorySession
}

export function selectMemorySessionStoreStrategy(): SessionStoreStrategyType {
  return { type: SessionPersistence.MEMORY }
}

export function initMemorySessionStoreStrategy(): SessionStoreStrategy {
  const globalObject = getGlobalObject<GlobalObjectWithSession>()

  // Share the observable across SDK instances (RUM + Logs)
  if (!globalObject[MEMORY_SESSION_STORE_KEY]) {
    globalObject[MEMORY_SESSION_STORE_KEY] = {}
  }
  const memorySession = globalObject[MEMORY_SESSION_STORE_KEY]

  const sessionObservable = new Observable<SessionState>()

  // Wire the local observable to the shared onChange callback so that
  // multiple SDK instances (RUM + Logs) can observe each other's changes.
  const previousOnChange = memorySession.onChange
  memorySession.onChange = (state: SessionState) => {
    previousOnChange?.(state)
    sessionObservable.notify(state)
  }

  return {
    setSessionState(fn: (sessionState: SessionState) => SessionState): Promise<void> {
      const currentState = memorySession.state ?? {}
      const newState = shallowClone(fn(currentState))
      memorySession.state = newState
      const result = Promise.resolve()
      memorySession.onChange?.(newState)
      return result
    },
    sessionObservable,
  }
}

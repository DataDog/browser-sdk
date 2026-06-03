import { globalObject } from '../../../tools/globalObject'
import { Observable } from '../../../tools/observable'
import { shallowClone } from '../../../tools/utils/objectUtils'
import { SessionPersistence } from '../sessionConstants'
import type { SessionState } from '../sessionState'
import type { SessionStateOperation, SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'

export const MEMORY_SESSION_STORE_KEY = '_DD_SESSION'

export interface MemorySession {
  state?: SessionState
  onChange?: (state: SessionState) => void
}

export interface GlobalObjectWithSession {
  [MEMORY_SESSION_STORE_KEY]?: MemorySession
}

export function selectMemorySessionStoreStrategy(): SessionStoreStrategyType {
  return { type: SessionPersistence.MEMORY }
}

export function initMemorySessionStoreStrategy(): SessionStoreStrategy {
  const globalObjectWithSession = globalObject as GlobalObjectWithSession

  // Share the observable across SDK instances (RUM + Logs)
  if (!globalObjectWithSession[MEMORY_SESSION_STORE_KEY]) {
    globalObjectWithSession[MEMORY_SESSION_STORE_KEY] = {}
  }
  const memorySession = globalObjectWithSession[MEMORY_SESSION_STORE_KEY]

  const sessionObservable = new Observable<SessionState>()

  // Wire the local observable to the shared onChange callback so that
  // multiple SDK instances (RUM + Logs) can observe each other's changes.
  const previousOnChange = memorySession.onChange
  memorySession.onChange = (state: SessionState) => {
    previousOnChange?.(state)
    sessionObservable.notify(state)
  }

  return {
    async setSessionState(
      fn: (sessionState: SessionState) => SessionState,
      _operation: SessionStateOperation
    ): Promise<void> {
      const currentState = memorySession.state ?? {}
      const newState = shallowClone(fn(currentState))
      memorySession.state = newState
      await Promise.resolve()
      memorySession.onChange?.(newState)
    },
    sessionObservable,
  }
}

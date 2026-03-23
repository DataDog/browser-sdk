import { generateUUID } from '../../../tools/utils/stringUtils'
import { Observable } from '../../../tools/observable'
import { SessionPersistence } from '../sessionConstants'
import type { SessionState } from '../sessionState'
import { toSessionString, toSessionState } from '../sessionState'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'

const LOCAL_STORAGE_TEST_KEY = '_dd_test_'

export function selectLocalStorageStrategy(): SessionStoreStrategyType | undefined {
  try {
    const id = generateUUID()
    const testKey = `${LOCAL_STORAGE_TEST_KEY}${id}`
    localStorage.setItem(testKey, id)
    const retrievedId = localStorage.getItem(testKey)
    localStorage.removeItem(testKey)
    return id === retrievedId ? { type: SessionPersistence.LOCAL_STORAGE } : undefined
  } catch {
    return undefined
  }
}

export function initLocalStorageStrategy(): SessionStoreStrategy {
  const sessionObservable = new Observable<SessionState>((observable) => {
    const listener = (event: StorageEvent) => {
      if (event.key === SESSION_STORE_KEY && event.storageArea === localStorage) {
        observable.notify(toSessionState(event.newValue))
      }
    }
    // eslint-disable-next-line local-rules/disallow-zone-js-patched-values
    window.addEventListener('storage', listener)
    return () => {
      // eslint-disable-next-line local-rules/disallow-zone-js-patched-values
      window.removeEventListener('storage', listener)
    }
  })

  return {
    setSessionState(fn: (sessionState: SessionState) => SessionState): Promise<void> {
      const currentState = toSessionState(localStorage.getItem(SESSION_STORE_KEY))
      const newState = fn(currentState)
      localStorage.setItem(SESSION_STORE_KEY, toSessionString(newState))
      sessionObservable.notify(newState)
      return Promise.resolve()
    },
    sessionObservable,
  }
}

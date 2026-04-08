import { generateUUID } from '../../../tools/utils/stringUtils'
import { Observable } from '../../../tools/observable'
import { addEventListener } from '../../../browser/addEventListener'
import type { Configuration } from '../../configuration'
import { SessionPersistence } from '../sessionConstants'
import type { SessionState } from '../sessionState'
import { toSessionString, toSessionState } from '../sessionState'
import type { SessionStoreStrategy, SessionStoreStrategyType, SessionObservableEvent } from './sessionStoreStrategy'
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

export function initLocalStorageStrategy(configuration: Configuration): SessionStoreStrategy {
  const sessionObservable = new Observable<SessionObservableEvent>(
    (observable) =>
      addEventListener(configuration, window, 'storage', (event) => {
        if (event.key === SESSION_STORE_KEY && event.storageArea === localStorage) {
          observable.notify({ cookieValue: undefined, sessionState: toSessionState(event.newValue) })
        }
      }).stop
  )

  return {
    async setSessionState(fn: (sessionState: SessionState) => SessionState): Promise<void> {
      const currentState = toSessionState(localStorage.getItem(SESSION_STORE_KEY))
      const newState = fn(currentState)
      localStorage.setItem(SESSION_STORE_KEY, toSessionString(newState))
      await Promise.resolve()
      sessionObservable.notify({ cookieValue: undefined, sessionState: newState })
    },
    sessionObservable,
  }
}

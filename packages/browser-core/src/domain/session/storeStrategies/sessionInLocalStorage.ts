import { generateUUID } from '@datadog/js-core/util'
import { Observable } from '../../../tools/observable'
import { addEventListener } from '../../../browser/addEventListener'
import { SessionPersistence } from '../sessionConstants'
import type { SessionState } from '../sessionState'
import { isSessionInNotStartedState, toSessionString, toSessionState } from '../sessionState'
import type { SessionStateOperation, SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'
import { SESSION_STORE_KEY, LEGACY_SESSION_STORE_KEY } from './sessionStoreStrategy'

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
  const sessionObservable = new Observable<SessionState>(
    (observable) =>
      addEventListener(window, 'storage', (event) => {
        if (event.key === SESSION_STORE_KEY && event.storageArea === localStorage) {
          observable.notify(toSessionState(event.newValue))
        }
      }).stop
  )

  let isFirstCall = true

  return {
    async setSessionState(
      fn: (sessionState: SessionState) => SessionState,
      _operation: SessionStateOperation
    ): Promise<void> {
      let currentState = toSessionState(localStorage.getItem(SESSION_STORE_KEY))

      if (isFirstCall && isSessionInNotStartedState(currentState)) {
        currentState = toSessionState(localStorage.getItem(LEGACY_SESSION_STORE_KEY))
      }
      isFirstCall = false

      const newState = fn(currentState)
      localStorage.setItem(SESSION_STORE_KEY, toSessionString(newState))
      await Promise.resolve()
      sessionObservable.notify(newState)
    },
    sessionObservable,
  }
}

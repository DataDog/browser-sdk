import { generateUUID } from '../../../tools/utils/stringUtils'
import type { SessionState } from '../sessionState'
import { toSessionString, toSessionState } from '../sessionState'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'

const LOCAL_STORAGE_TEST_KEY = '_dd_test_'

export function selectLocalStorageStrategy(): SessionStoreStrategyType | undefined {
  try {
    const id = generateUUID()
    localStorage.setItem(`${LOCAL_STORAGE_TEST_KEY}${id}`, id)
    const retrievedId = localStorage.getItem(`${LOCAL_STORAGE_TEST_KEY}${id}`)
    localStorage.removeItem(`${LOCAL_STORAGE_TEST_KEY}${id}`)
    return id === retrievedId ? { type: 'LocalStorage' } : undefined
  } catch (e) {
    return undefined
  }
}

export function initLocalStorageStrategy(): SessionStoreStrategy {
  return {
    persistSession: persistInLocalStorage,
    retrieveSession: retrieveSessionFromLocalStorage,
    clearSession: clearSessionFromLocalStorage,
  }
}

function persistInLocalStorage(sessionState: SessionState) {
  localStorage.setItem(SESSION_STORE_KEY, toSessionString(sessionState))
}

function retrieveSessionFromLocalStorage(): SessionState {
  const sessionString = localStorage.getItem(SESSION_STORE_KEY)
  return toSessionState(sessionString)
}

function clearSessionFromLocalStorage() {
  localStorage.removeItem(SESSION_STORE_KEY)
}

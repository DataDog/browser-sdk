import { generateUUID } from '../../../tools/utils/stringUtils'
import type { SessionState } from '../sessionState'
import { toSessionString, toSessionState } from '../sessionState'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'

export const LOCAL_STORAGE_KEY = '_dd_s'
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
  localStorage.setItem(LOCAL_STORAGE_KEY, toSessionString(sessionState))
}

function retrieveSessionFromLocalStorage(): SessionState {
  const sessionString = localStorage.getItem(LOCAL_STORAGE_KEY)
  return toSessionState(sessionString)
}

function clearSessionFromLocalStorage() {
  localStorage.removeItem(LOCAL_STORAGE_KEY)
}

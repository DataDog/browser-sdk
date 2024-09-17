import { ExperimentalFeature, isExperimentalFeatureEnabled } from '../../../tools/experimentalFeatures'
import { generateUUID } from '../../../tools/utils/stringUtils'
import { generateAnonymousId, setAnonymousIdInStorage } from '../../user'
import type { SessionState } from '../sessionState'
import { toSessionString, toSessionState, getExpiredSessionState } from '../sessionState'
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
    return id === retrievedId ? { type: 'LocalStorage' } : undefined
  } catch (e) {
    return undefined
  }
}

export function initLocalStorageStrategy(): SessionStoreStrategy {
  return {
    isLockEnabled: false,
    persistSession: persistInLocalStorage,
    retrieveSession: retrieveSessionFromLocalStorage,
    expireSession: expireSessionFromLocalStorage,
  }
}

function persistInLocalStorage(sessionState: SessionState) {
  if (!sessionState.device && isExperimentalFeatureEnabled(ExperimentalFeature.ANONYMOUS_USER_TRACKING)) {
    sessionState.device = generateAnonymousId()
    setAnonymousIdInStorage('LocalStorage', sessionState.device)
  }
  localStorage.setItem(SESSION_STORE_KEY, toSessionString(sessionState))
}

function retrieveSessionFromLocalStorage(): SessionState {
  const sessionString = localStorage.getItem(SESSION_STORE_KEY)
  const sessionState = toSessionState(sessionString)
  let device = sessionState.device

  if (isExperimentalFeatureEnabled(ExperimentalFeature.ANONYMOUS_USER_TRACKING) && !device) {
    // init device id if it does not exist or if session cookie does not exist
    device = generateAnonymousId()
    setAnonymousIdInStorage('LocalStorage', device)
    sessionState.device = device
  }
  return sessionState
}

function expireSessionFromLocalStorage() {
  persistInLocalStorage(getExpiredSessionState())
}

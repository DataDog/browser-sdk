import { generateUUID } from '../../tools/utils/stringUtils'
import type { SessionState, SessionStore, StoreInitOptions } from './sessionStore'
import { toSessionString, toSessionState } from './sessionStore'

export const LOCAL_STORAGE_KEY = '_dd_s'

export function initLocalStorage(_options: StoreInitOptions): SessionStore | undefined {
  if (!isLocalStorageAvailable()) {
    return undefined
  }

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

function isLocalStorageAvailable() {
  try {
    const id = generateUUID()
    localStorage.setItem(`_dd_s_${id}`, id)
    const retrievedId = localStorage.getItem(`_dd_s_${id}`)
    localStorage.removeItem(`_dd_s_${id}`)
    return id === retrievedId
  } catch (e) {
    return false
  }
}

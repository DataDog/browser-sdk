import type { SessionState, SessionStore } from './sessionStore'
import { toSessionString, toSessionState } from './sessionStore'

export const LOCAL_STORAGE_KEY = '_dd_s'

export function initLocalStorage(): SessionStore {
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

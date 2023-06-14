import { LOCAL_STORAGE_KEY, initLocalStorage } from './sessionLocalStorageStore'
import type { SessionState, SessionStore } from './sessionStore'

describe('session local storage store', () => {
  const sessionState: SessionState = { id: '123', created: '0' }
  let localStorageStore: SessionStore

  beforeEach(() => {
    localStorageStore = initLocalStorage()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('should persist a session in local storage', () => {
    localStorageStore.persistSession(sessionState)
    const session = localStorageStore.retrieveSession()
    expect(session).toEqual({ ...sessionState })
    expect(window.localStorage.getItem(LOCAL_STORAGE_KEY)).toMatch(/.*id=.*created/)
  })

  it('should delete the local storage item holding the session', () => {
    localStorageStore.persistSession(sessionState)
    localStorageStore.clearSession()
    const session = localStorageStore.retrieveSession()
    expect(session).toEqual({})
    expect(window.localStorage.getItem(LOCAL_STORAGE_KEY)).toBeNull()
  })

  it('should not interfere with other keys present in local storage', () => {
    window.localStorage.setItem('test', 'hello')
    localStorageStore.persistSession(sessionState)
    localStorageStore.retrieveSession()
    localStorageStore.clearSession()
    expect(window.localStorage.getItem('test')).toEqual('hello')
  })

  it('should return an empty object if session string is invalid', () => {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, '{test:42}')
    const session = localStorageStore.retrieveSession()
    expect(session).toEqual({})
  })
})

import type { SessionState } from '../sessionState'
import { LOCAL_STORAGE_KEY, selectLocalStorageStrategy, initLocalStorageStrategy } from './sessionInLocalStorage'

describe('session in local storage strategy', () => {
  const sessionState: SessionState = { id: '123', created: '0' }

  afterEach(() => {
    window.localStorage.clear()
  })

  it('should report local storage as available', () => {
    const available = selectLocalStorageStrategy()
    expect(available).toEqual({ type: 'LocalStorage' })
  })

  it('should report local storage as not available', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('Unavailable')
    const available = selectLocalStorageStrategy()
    expect(available).toBeUndefined()
  })

  it('should persist a session in local storage', () => {
    const localStorageStrategy = initLocalStorageStrategy()
    localStorageStrategy.persistSession(sessionState)
    const session = localStorageStrategy.retrieveSession()
    expect(session).toEqual({ ...sessionState })
    expect(window.localStorage.getItem(LOCAL_STORAGE_KEY)).toMatch(/.*id=.*created/)
  })

  it('should delete the local storage item holding the session', () => {
    const localStorageStrategy = initLocalStorageStrategy()
    localStorageStrategy.persistSession(sessionState)
    localStorageStrategy.clearSession()
    const session = localStorageStrategy?.retrieveSession()
    expect(session).toEqual({})
    expect(window.localStorage.getItem(LOCAL_STORAGE_KEY)).toBeNull()
  })

  it('should not interfere with other keys present in local storage', () => {
    window.localStorage.setItem('test', 'hello')
    const localStorageStrategy = initLocalStorageStrategy()
    localStorageStrategy.persistSession(sessionState)
    localStorageStrategy.retrieveSession()
    localStorageStrategy.clearSession()
    expect(window.localStorage.getItem('test')).toEqual('hello')
  })

  it('should return an empty object if session string is invalid', () => {
    const localStorageStrategy = initLocalStorageStrategy()
    localStorage.setItem(LOCAL_STORAGE_KEY, '{test:42}')
    const session = localStorageStrategy?.retrieveSession()
    expect(session).toEqual({})
  })
})

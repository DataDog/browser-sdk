import { SessionExpiredReason, type SessionState } from '../sessionState'
import { selectLocalStorageStrategy, initLocalStorageStrategy } from './sessionInLocalStorage'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'

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
    expect(window.localStorage.getItem(SESSION_STORE_KEY)).toMatch(/.*id=.*created/)
  })

  it('should set `isExpired=1` to the local storage item holding the session', () => {
    const localStorageStrategy = initLocalStorageStrategy()
    localStorageStrategy.persistSession(sessionState)
    localStorageStrategy.expireSession()
    const session = localStorageStrategy?.retrieveSession()
    expect(session).toEqual({ isExpired: SessionExpiredReason.UNKNOWN })
    expect(window.localStorage.getItem(SESSION_STORE_KEY)).toBe('isExpired=1')
  })

  it('should not interfere with other keys present in local storage', () => {
    window.localStorage.setItem('test', 'hello')
    const localStorageStrategy = initLocalStorageStrategy()
    localStorageStrategy.persistSession(sessionState)
    localStorageStrategy.retrieveSession()
    localStorageStrategy.expireSession()
    expect(window.localStorage.getItem('test')).toEqual('hello')
  })

  it('should return an empty object if session string is invalid', () => {
    const localStorageStrategy = initLocalStorageStrategy()
    localStorage.setItem(SESSION_STORE_KEY, '{test:42}')
    const session = localStorageStrategy?.retrieveSession()
    expect(session).toEqual({})
  })
})

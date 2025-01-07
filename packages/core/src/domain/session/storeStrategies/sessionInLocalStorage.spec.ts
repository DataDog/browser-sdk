import type { Configuration } from '../../configuration'
import { SessionPersistence } from '../sessionConstants'
import { type SessionState } from '../sessionState'
import { selectLocalStorageStrategy, initLocalStorageStrategy } from './sessionInLocalStorage'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'
const DEFAULT_INIT_CONFIGURATION = { trackAnonymousUser: true } as Configuration

describe('session in local storage strategy', () => {
  const sessionState: SessionState = { id: '123', created: '0' }
  beforeEach(() => {
    spyOn(Math, 'random').and.returnValue(0)
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('should report local storage as available', () => {
    const available = selectLocalStorageStrategy()
    expect(available).toEqual({ type: SessionPersistence.LOCAL_STORAGE })
  })

  it('should report local storage as not available', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('Unavailable')
    const available = selectLocalStorageStrategy()
    expect(available).toBeUndefined()
  })

  it('should persist a session in local storage', () => {
    const localStorageStrategy = initLocalStorageStrategy(DEFAULT_INIT_CONFIGURATION)
    localStorageStrategy.persistSession(sessionState)
    const session = localStorageStrategy.retrieveSession()
    expect(session).toEqual({ ...sessionState })
    expect(window.localStorage.getItem(SESSION_STORE_KEY)).toMatch(/.*id=.*created/)
  })

  it('should set `isExpired=1` to the local storage item holding the session', () => {
    const localStorageStrategy = initLocalStorageStrategy(DEFAULT_INIT_CONFIGURATION)
    localStorageStrategy.persistSession(sessionState)
    localStorageStrategy.expireSession(sessionState)
    const session = localStorageStrategy?.retrieveSession()
    expect(session).toEqual({ isExpired: '1', anonymousId: '0000000000' })
    expect(window.localStorage.getItem(SESSION_STORE_KEY)).toBe('isExpired=1&aid=0000000000')
  })

  it('should not interfere with other keys present in local storage', () => {
    window.localStorage.setItem('test', 'hello')
    const localStorageStrategy = initLocalStorageStrategy(DEFAULT_INIT_CONFIGURATION)
    localStorageStrategy.persistSession(sessionState)
    localStorageStrategy.retrieveSession()
    localStorageStrategy.expireSession(sessionState)
    expect(window.localStorage.getItem('test')).toEqual('hello')
  })
})

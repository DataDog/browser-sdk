import type { Configuration } from '../../configuration'
import { SessionPersistence } from '../sessionConstants'
import { toSessionState } from '../sessionState'
import type { SessionState } from '../sessionState'
import { selectLocalStorageStrategy, initLocalStorageStrategy } from './sessionInLocalStorage'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'
const DEFAULT_INIT_CONFIGURATION = { trackAnonymousUser: true } as Configuration

function getSessionStateFromLocalStorage(SESSION_STORE_KEY: string): SessionState {
  return toSessionState(window.localStorage.getItem(SESSION_STORE_KEY))
}
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
    expect(getSessionStateFromLocalStorage(SESSION_STORE_KEY)).toEqual(sessionState)
  })

  it('should set `isExpired=1` to the local storage item holding the session', () => {
    const localStorageStrategy = initLocalStorageStrategy(DEFAULT_INIT_CONFIGURATION)
    localStorageStrategy.persistSession(sessionState)
    localStorageStrategy.expireSession(sessionState)
    const session = localStorageStrategy?.retrieveSession()
    expect(session).toEqual({ isExpired: '1', anonymousId: jasmine.any(String) })
    expect(getSessionStateFromLocalStorage(SESSION_STORE_KEY)).toEqual({
      isExpired: '1',
      anonymousId: jasmine.any(String),
    })
  })

  it('should return an empty object if session string is invalid', () => {
    const localStorageStrategy = initLocalStorageStrategy(DEFAULT_INIT_CONFIGURATION)
    window.localStorage.setItem(SESSION_STORE_KEY, '{test:42}')
    const session = localStorageStrategy.retrieveSession()
    expect(session).toEqual({})
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

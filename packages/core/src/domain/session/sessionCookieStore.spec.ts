import type { CookieOptions } from '../../browser/cookie'
import { getCookie, setCookie, deleteCookie } from '../../browser/cookie'
import { SESSION_COOKIE_NAME, initCookieStore } from './sessionCookieStore'

import type { SessionState, SessionStore } from './sessionStore'

describe('session cookie store', () => {
  const sessionState: SessionState = { id: '123', created: '0' }
  const noOptions: CookieOptions = {}
  let cookieStorage: SessionStore

  beforeEach(() => {
    cookieStorage = initCookieStore(noOptions)
  })

  afterEach(() => {
    deleteCookie(SESSION_COOKIE_NAME)
  })

  it('should persist a session in a cookie', () => {
    cookieStorage.persistSession(sessionState)
    const session = cookieStorage.retrieveSession()
    expect(session).toEqual({ ...sessionState })
    expect(getCookie(SESSION_COOKIE_NAME)).toBe('id=123&created=0')
  })

  it('should delete the cookie holding the session', () => {
    cookieStorage.persistSession(sessionState)
    cookieStorage.clearSession()
    const session = cookieStorage.retrieveSession()
    expect(session).toEqual({})
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
  })

  it('should return an empty object if session string is invalid', () => {
    setCookie(SESSION_COOKIE_NAME, '{test:42}', 1000)
    const session = cookieStorage.retrieveSession()
    expect(session).toEqual({})
  })
})

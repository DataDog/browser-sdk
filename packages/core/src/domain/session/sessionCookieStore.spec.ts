import type { CookieOptions } from '../../browser/cookie'
import { setCookie, deleteCookie } from '../../browser/cookie'
import { SESSION_COOKIE_NAME, initCookieStorage } from './sessionCookieStore'

import type { SessionState, SessionStorage } from './sessionStorage'

describe('session cookie store', () => {
  const sessionState: SessionState = { id: '123', created: '0' }
  const noOptions: CookieOptions = {}
  let cookieStorage: SessionStorage

  beforeEach(() => {
    cookieStorage = initCookieStorage(noOptions)
  })

  afterEach(() => {
    deleteCookie(SESSION_COOKIE_NAME)
  })

  it('should persist a session in a cookie', () => {
    cookieStorage.persistSession(sessionState)
    const session = cookieStorage.retrieveSession()
    expect(session).toEqual({ ...sessionState })
  })

  it('should delete the cookie holding the session', () => {
    cookieStorage.persistSession(sessionState)
    cookieStorage.clearSession()
    const session = cookieStorage.retrieveSession()
    expect(session).toEqual({})
  })

  it('should return an empty object if session string is invalid', () => {
    setCookie(SESSION_COOKIE_NAME, '{test:42}', 1000)
    const session = cookieStorage.retrieveSession()
    expect(session).toEqual({})
  })
})

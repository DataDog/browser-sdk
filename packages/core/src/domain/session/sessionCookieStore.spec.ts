import type { CookieOptions } from '../../browser/cookie'
import { setCookie, deleteCookie } from '../../browser/cookie'
import { SESSION_EXPIRATION_DELAY } from './sessionConstants'
import {
  SESSION_COOKIE_NAME,
  deleteSessionCookie,
  persistSessionCookie,
  retrieveSessionCookie,
} from './sessionCookieStore'

import type { SessionState } from './sessionStorage'

describe('session cookie store', () => {
  const sessionState: SessionState = { id: '123', created: '0' }
  const noOptions: CookieOptions = {}

  afterEach(() => {
    deleteCookie(SESSION_COOKIE_NAME)
  })

  it('should persist a session in a cookie', () => {
    const now = Date.now()
    persistSessionCookie(sessionState, noOptions)
    const session = retrieveSessionCookie()
    expect(session).toEqual({ ...sessionState })
    expect(+session.expire!).toBeGreaterThanOrEqual(now + SESSION_EXPIRATION_DELAY)
  })

  it('should delete the cookie holding the session', () => {
    persistSessionCookie(sessionState, noOptions)
    deleteSessionCookie(noOptions)
    const session = retrieveSessionCookie()
    expect(session).toEqual({})
  })

  it('should return an empty object if session string is invalid', () => {
    setCookie(SESSION_COOKIE_NAME, '{test:42}', 1000)
    const session = retrieveSessionCookie()
    expect(session).toEqual({})
  })
})

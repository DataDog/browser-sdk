import { getCookie, SESSION_COOKIE_NAME, setCookie } from '../src'
import { cacheCookieAccess } from '../src/cookie'
import { LOGS_COOKIE_NAME, RUM_COOKIE_NAME, tryCookieMigration } from '../src/cookieMigration'
import { EXPIRATION_DELAY } from '../src/sessionManagement'

describe('cookie migration', () => {
  it('should not touch current format cookies', () => {
    setCookie(SESSION_COOKIE_NAME, 'abcde', EXPIRATION_DELAY)
    setCookie(LOGS_COOKIE_NAME, '1', EXPIRATION_DELAY)
    setCookie(RUM_COOKIE_NAME, '0', EXPIRATION_DELAY)

    tryCookieMigration(cacheCookieAccess(SESSION_COOKIE_NAME))

    expect(getCookie(SESSION_COOKIE_NAME)).toBe('abcde')
    expect(getCookie(LOGS_COOKIE_NAME)).toBe('1')
    expect(getCookie(RUM_COOKIE_NAME)).toBe('0')
  })

  it('should restore current format cookies', () => {
    setCookie(SESSION_COOKIE_NAME, 'id=abcde&logs=1&rum=0', EXPIRATION_DELAY)

    tryCookieMigration(cacheCookieAccess(SESSION_COOKIE_NAME))

    expect(getCookie(SESSION_COOKIE_NAME)).toBe('abcde')
    expect(getCookie(LOGS_COOKIE_NAME)).toBe('1')
    expect(getCookie(RUM_COOKIE_NAME)).toBe('0')
  })

  it('should restore single cookie', () => {
    setCookie(SESSION_COOKIE_NAME, 'rum=0', EXPIRATION_DELAY)

    tryCookieMigration(cacheCookieAccess(SESSION_COOKIE_NAME))

    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    expect(getCookie(LOGS_COOKIE_NAME)).toBeUndefined()
    expect(getCookie(RUM_COOKIE_NAME)).toBe('0')
  })
})

import { getCookie, setCookie } from '../../browser/cookie'
import {
  OLD_LOGS_COOKIE_NAME,
  OLD_RUM_COOKIE_NAME,
  OLD_SESSION_COOKIE_NAME,
  tryOldCookiesMigration,
} from './oldCookiesMigration'
import { SESSION_EXPIRATION_DELAY } from './sessionConstants'
import { initCookieStrategy } from './storeStrategies/sessionInCookie'
import { SESSION_STORE_KEY } from './storeStrategies/sessionStoreStrategy'

describe('old cookies migration', () => {
  const sessionStoreStrategy = initCookieStrategy({})

  it('should not touch current cookie', () => {
    setCookie(SESSION_STORE_KEY, 'id=abcde&rum=0&logs=1&expire=1234567890', SESSION_EXPIRATION_DELAY)

    tryOldCookiesMigration(sessionStoreStrategy)

    expect(getCookie(SESSION_STORE_KEY)).toBe('id=abcde&rum=0&logs=1&expire=1234567890')
  })

  it('should create new cookie from old cookie values', () => {
    setCookie(OLD_SESSION_COOKIE_NAME, 'abcde', SESSION_EXPIRATION_DELAY)
    setCookie(OLD_LOGS_COOKIE_NAME, '1', SESSION_EXPIRATION_DELAY)
    setCookie(OLD_RUM_COOKIE_NAME, '0', SESSION_EXPIRATION_DELAY)

    tryOldCookiesMigration(sessionStoreStrategy)

    expect(getCookie(SESSION_STORE_KEY)).toContain('id=abcde')
    expect(getCookie(SESSION_STORE_KEY)).toContain('rum=0')
    expect(getCookie(SESSION_STORE_KEY)).toContain('logs=1')
    expect(getCookie(SESSION_STORE_KEY)).toMatch(/expire=\d+/)
  })

  it('should create new cookie from a single old cookie', () => {
    setCookie(OLD_RUM_COOKIE_NAME, '0', SESSION_EXPIRATION_DELAY)

    tryOldCookiesMigration(sessionStoreStrategy)

    expect(getCookie(SESSION_STORE_KEY)).not.toContain('id=')
    expect(getCookie(SESSION_STORE_KEY)).toContain('rum=0')
    expect(getCookie(SESSION_STORE_KEY)).toMatch(/expire=\d+/)
  })

  it('should not create a new cookie if no old cookie is present', () => {
    tryOldCookiesMigration(sessionStoreStrategy)
    expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()
  })
})

import { getCookie, resetInitCookies, setCookie } from '../../browser/cookie'
import { getSessionState } from '../../../test'
import type { Configuration } from '../configuration'
import {
  OLD_LOGS_COOKIE_NAME,
  OLD_RUM_COOKIE_NAME,
  OLD_SESSION_COOKIE_NAME,
  tryOldCookiesMigration,
} from './oldCookiesMigration'
import { SESSION_EXPIRATION_DELAY } from './sessionConstants'
import { initCookieStrategy } from './storeStrategies/sessionInCookie'
import type { SessionStoreStrategy } from './storeStrategies/sessionStoreStrategy'
import { SESSION_STORE_KEY } from './storeStrategies/sessionStoreStrategy'
const DEFAULT_INIT_CONFIGURATION = { trackAnonymousUser: true } as Configuration

describe('old cookies migration', () => {
  let sessionStoreStrategy: SessionStoreStrategy

  beforeEach(() => {
    sessionStoreStrategy = initCookieStrategy(DEFAULT_INIT_CONFIGURATION, {})
    resetInitCookies()
  })

  afterEach(() => {
    resetInitCookies()
  })

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

    expect(getSessionState(SESSION_STORE_KEY).id).toBe('abcde')
    expect(getSessionState(SESSION_STORE_KEY).rum).toBe('0')
    expect(getSessionState(SESSION_STORE_KEY).logs).toBe('1')
    expect(getSessionState(SESSION_STORE_KEY).expire).toMatch(/\d+/)
  })

  it('should create new cookie from a single old cookie', () => {
    setCookie(OLD_RUM_COOKIE_NAME, '0', SESSION_EXPIRATION_DELAY)

    tryOldCookiesMigration(sessionStoreStrategy)
    expect(getSessionState(SESSION_STORE_KEY).id).not.toBeDefined()
    expect(getSessionState(SESSION_STORE_KEY).rum).toBe('0')
    expect(getSessionState(SESSION_STORE_KEY).expire).toMatch(/\d+/)
  })

  it('should not create a new cookie if no old cookie is present', () => {
    tryOldCookiesMigration(sessionStoreStrategy)
    expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()
  })

  it('should behave correctly when performing the migration multiple times', () => {
    setCookie(OLD_SESSION_COOKIE_NAME, 'abcde', SESSION_EXPIRATION_DELAY)
    setCookie(OLD_LOGS_COOKIE_NAME, '1', SESSION_EXPIRATION_DELAY)
    setCookie(OLD_RUM_COOKIE_NAME, '0', SESSION_EXPIRATION_DELAY)

    tryOldCookiesMigration(sessionStoreStrategy)
    tryOldCookiesMigration(sessionStoreStrategy)

    expect(getSessionState(SESSION_STORE_KEY).id).toBe('abcde')
    expect(getSessionState(SESSION_STORE_KEY).rum).toBe('0')
    expect(getSessionState(SESSION_STORE_KEY).logs).toBe('1')
    expect(getSessionState(SESSION_STORE_KEY).expire).toMatch(/\d+/)
  })
})

import {
  cacheCookieAccess,
  COOKIE_ACCESS_DELAY,
  CookieCache,
  getCookie,
  SESSION_COOKIE_NAME,
  setCookie,
  startSessionTracking,
} from '../session'

describe('session', () => {
  const DURATION = 123456

  it('should store id in cookie', () => {
    startSessionTracking()

    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)
  })

  it('should keep existing id', () => {
    setCookie(SESSION_COOKIE_NAME, 'abcdef', DURATION)

    startSessionTracking()

    expect(getCookie(SESSION_COOKIE_NAME)).toEqual('abcdef')
  })

  it('should renew session on activity after expiration', () => {
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date())

    startSessionTracking()

    setCookie(SESSION_COOKIE_NAME, '', DURATION)
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    jasmine.clock().tick(COOKIE_ACCESS_DELAY)

    document.dispatchEvent(new CustomEvent('click'))

    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)

    jasmine.clock().uninstall()
  })
})

describe('cacheCookieAccess', () => {
  const TEST_COOKIE = 'test'
  const TEST_DELAY = 1000
  const DURATION = 123456
  let cookieCache: CookieCache

  beforeEach(() => {
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date())
    cookieCache = cacheCookieAccess(TEST_COOKIE)
  })

  afterEach(() => jasmine.clock().uninstall())

  it('should keep cookie value in cache', () => {
    setCookie(TEST_COOKIE, 'foo', DURATION)
    expect(cookieCache.get()).toEqual('foo')

    setCookie(TEST_COOKIE, '', DURATION)
    expect(cookieCache.get()).toEqual('foo')

    jasmine.clock().tick(TEST_DELAY)
    expect(cookieCache.get()).toBeUndefined()
  })

  it('should invalidate cache when updating the cookie', () => {
    setCookie(TEST_COOKIE, 'foo', DURATION)
    expect(cookieCache.get()).toEqual('foo')

    cookieCache.set('bar', DURATION)
    expect(cookieCache.get()).toEqual('bar')
  })
})

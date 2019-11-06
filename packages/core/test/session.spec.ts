import {
  cacheCookieAccess,
  cleanupActivityTracking,
  COOKIE_ACCESS_DELAY,
  CookieCache,
  getCookie,
  initSession,
  SESSION_COOKIE_NAME,
  setCookie,
} from '../src/session'
import { isIE } from '../src/specHelper'

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

describe('initSession', () => {
  const DURATION = 123456
  const TYPE_COOKIE_NAME = 'foo'
  const TYPE_COOKIE_NAME_B = 'bar'

  function getTypeInfo(rawType?: string) {
    const type = rawType === 'not-tracked' ? ('not-tracked' as 'not-tracked') : ('tracked' as 'tracked')
    return {
      type,
      isTracked: type === 'tracked',
    }
  }

  function expireSession() {
    setCookie(TYPE_COOKIE_NAME, '', DURATION)
    setCookie(TYPE_COOKIE_NAME_B, '', DURATION)
    setCookie(SESSION_COOKIE_NAME, '', DURATION)
    jasmine.clock().tick(COOKIE_ACCESS_DELAY)
  }

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date())
  })

  afterEach(() => {
    // flush pending callbacks to avoid random failures
    jasmine.clock().tick(new Date().getTime())
    jasmine.clock().uninstall()
    cleanupActivityTracking()
  })

  it('when tracked, should store session type and id', () => {
    const session = initSession(TYPE_COOKIE_NAME, (rawType) => getTypeInfo(rawType || 'tracked'))

    expect(session.getType()).toEqual('tracked')
    expect(session.getId()).toMatch(/^[a-f0-9-]+$/)
    expect(getCookie(TYPE_COOKIE_NAME)).toEqual('tracked')
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)
  })

  it('when not tracked should store session type', () => {
    const session = initSession(TYPE_COOKIE_NAME, (rawType) => getTypeInfo(rawType || 'not-tracked'))

    expect(session.getType()).toEqual('not-tracked')
    expect(session.getId()).toBeUndefined()
    expect(getCookie(TYPE_COOKIE_NAME)).toEqual('not-tracked')
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
  })

  it('when tracked should keep existing session type and id', () => {
    setCookie(TYPE_COOKIE_NAME, 'tracked', DURATION)
    setCookie(SESSION_COOKIE_NAME, 'abcdef', DURATION)

    const session = initSession(TYPE_COOKIE_NAME, getTypeInfo)

    expect(session.getType()).toEqual('tracked')
    expect(session.getId()).toMatch('abcdef')
    expect(getCookie(TYPE_COOKIE_NAME)).toEqual('tracked')
    expect(getCookie(SESSION_COOKIE_NAME)).toEqual('abcdef')
  })

  it('when not tracked should keep existing session type', () => {
    setCookie(TYPE_COOKIE_NAME, 'not-tracked', DURATION)

    const session = initSession(TYPE_COOKIE_NAME, getTypeInfo)

    expect(session.getType()).toEqual('not-tracked')
    expect(session.getId()).toBeUndefined()
    expect(getCookie(TYPE_COOKIE_NAME)).toEqual('not-tracked')
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
  })

  it('should renew on activity after expiration', () => {
    const session = initSession(TYPE_COOKIE_NAME, getTypeInfo)
    const renewSessionSpy = jasmine.createSpy()
    session.renewObservable.subscribe(renewSessionSpy)

    expireSession()

    expect(getCookie(TYPE_COOKIE_NAME)).toBeUndefined()
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    expect(renewSessionSpy).not.toHaveBeenCalled()
    expect(session.getType()).toBeUndefined()
    expect(session.getId()).toBeUndefined()

    document.dispatchEvent(new CustomEvent('click'))

    expect(renewSessionSpy).toHaveBeenCalled()
    expect(getCookie(TYPE_COOKIE_NAME)).toEqual('tracked')
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)
  })

  describe('multiple initSession calls', () => {
    it('should re-use the same session id', () => {
      const sessionA = initSession(TYPE_COOKIE_NAME, getTypeInfo)
      const idA = sessionA.getId()

      const sessionB = initSession(TYPE_COOKIE_NAME_B, getTypeInfo)
      const idB = sessionB.getId()

      expect(idA).toBe(idB)
    })

    it('should have independent types', () => {
      const sessionA = initSession(TYPE_COOKIE_NAME, (rawType) => getTypeInfo(rawType || 'tracked'))

      const sessionB = initSession(TYPE_COOKIE_NAME_B, (rawType) => getTypeInfo(rawType || 'not-tracked'))

      expect(sessionA.getType()).toEqual('tracked')
      expect(sessionB.getType()).toEqual('not-tracked')
    })

    it('should notify each renew observables', () => {
      const sessionA = initSession(TYPE_COOKIE_NAME, getTypeInfo)
      const renewSessionASpy = jasmine.createSpy()
      sessionA.renewObservable.subscribe(renewSessionASpy)

      const sessionB = initSession(TYPE_COOKIE_NAME_B, getTypeInfo)
      const renewSessionBSpy = jasmine.createSpy()
      sessionB.renewObservable.subscribe(renewSessionBSpy)

      expireSession()

      expect(renewSessionASpy).not.toHaveBeenCalled()
      expect(renewSessionBSpy).not.toHaveBeenCalled()

      document.dispatchEvent(new CustomEvent('click'))

      expect(renewSessionASpy).toHaveBeenCalled()
      expect(renewSessionBSpy).toHaveBeenCalled()
    })
  })
})

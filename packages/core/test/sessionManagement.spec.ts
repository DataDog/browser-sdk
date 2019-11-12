import {
  cacheCookieAccess,
  COOKIE_ACCESS_DELAY,
  CookieCache,
  getCookie,
  SESSION_COOKIE_NAME,
  setCookie,
  startSessionManagement,
  stopSessionManagement,
} from '../src/sessionManagement'
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

enum FakeSessionType {
  NOT_TRACKED = 'n',
  TRACKED = 't',
}
describe('startSessionManagement', () => {
  const DURATION = 123456
  const FIRST_SESSION_TYPE_COOKIE = 'foo'
  const SECOND_SESSION_TYPE_COOKIE = 'bar'

  function expireSession() {
    setCookie(FIRST_SESSION_TYPE_COOKIE, '', DURATION)
    setCookie(SECOND_SESSION_TYPE_COOKIE, '', DURATION)
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
    stopSessionManagement()
  })

  it('when tracked, should store session type and id', () => {
    const session = startSessionManagement(FIRST_SESSION_TYPE_COOKIE, () => ({
      isTracked: true,
      type: FakeSessionType.TRACKED,
    }))

    expect(session.getType()).toEqual(FakeSessionType.TRACKED)
    expect(session.getId()).toMatch(/^[a-f0-9-]+$/)
    expect(getCookie(FIRST_SESSION_TYPE_COOKIE)).toEqual(FakeSessionType.TRACKED)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)
  })

  it('when not tracked should store session type', () => {
    const session = startSessionManagement(FIRST_SESSION_TYPE_COOKIE, () => ({
      isTracked: false,
      type: FakeSessionType.NOT_TRACKED,
    }))

    expect(session.getType()).toEqual(FakeSessionType.NOT_TRACKED)
    expect(session.getId()).toBeUndefined()
    expect(getCookie(FIRST_SESSION_TYPE_COOKIE)).toEqual(FakeSessionType.NOT_TRACKED)
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
  })

  it('when tracked should keep existing session type and id', () => {
    setCookie(FIRST_SESSION_TYPE_COOKIE, FakeSessionType.TRACKED, DURATION)
    setCookie(SESSION_COOKIE_NAME, 'abcdef', DURATION)

    const session = startSessionManagement(FIRST_SESSION_TYPE_COOKIE, () => ({
      isTracked: true,
      type: FakeSessionType.TRACKED,
    }))

    expect(session.getType()).toEqual(FakeSessionType.TRACKED)
    expect(session.getId()).toMatch('abcdef')
    expect(getCookie(FIRST_SESSION_TYPE_COOKIE)).toEqual(FakeSessionType.TRACKED)
    expect(getCookie(SESSION_COOKIE_NAME)).toEqual('abcdef')
  })

  it('when not tracked should keep existing session type', () => {
    setCookie(FIRST_SESSION_TYPE_COOKIE, FakeSessionType.NOT_TRACKED, DURATION)

    const session = startSessionManagement(FIRST_SESSION_TYPE_COOKIE, () => ({
      isTracked: false,
      type: FakeSessionType.NOT_TRACKED,
    }))

    expect(session.getType()).toEqual(FakeSessionType.NOT_TRACKED)
    expect(session.getId()).toBeUndefined()
    expect(getCookie(FIRST_SESSION_TYPE_COOKIE)).toEqual(FakeSessionType.NOT_TRACKED)
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
  })

  describe('computeSessionState should be called with the session type cookie value', () => {
    it('should be called with an empty value if the cookie is not defined', () => {
      const spy = jasmine.createSpy().and.returnValue({ isTracked: true, type: FakeSessionType.TRACKED })
      startSessionManagement(FIRST_SESSION_TYPE_COOKIE, spy)
      expect(spy).toHaveBeenCalledWith(undefined)
    })

    it('should be called with an invalid value if the cookie has an invalid value', () => {
      setCookie(FIRST_SESSION_TYPE_COOKIE, 'invalid', DURATION)
      const spy = jasmine.createSpy().and.returnValue({ isTracked: true, type: FakeSessionType.TRACKED })
      startSessionManagement(FIRST_SESSION_TYPE_COOKIE, spy)
      expect(spy).toHaveBeenCalledWith('invalid')
    })

    it('should be called with the TRACKED type', () => {
      setCookie(FIRST_SESSION_TYPE_COOKIE, FakeSessionType.TRACKED, DURATION)
      const spy = jasmine.createSpy().and.returnValue({ isTracked: true, type: FakeSessionType.TRACKED })
      startSessionManagement(FIRST_SESSION_TYPE_COOKIE, spy)
      expect(spy).toHaveBeenCalledWith(FakeSessionType.TRACKED)
    })

    it('should be called with the NOT_TRACKED type', () => {
      setCookie(FIRST_SESSION_TYPE_COOKIE, FakeSessionType.NOT_TRACKED, DURATION)
      const spy = jasmine.createSpy().and.returnValue({ isTracked: false, type: FakeSessionType.NOT_TRACKED })
      startSessionManagement(FIRST_SESSION_TYPE_COOKIE, spy)
      expect(spy).toHaveBeenCalledWith(FakeSessionType.NOT_TRACKED)
    })
  })

  it('should renew on activity after expiration', () => {
    const session = startSessionManagement(FIRST_SESSION_TYPE_COOKIE, () => ({
      isTracked: true,
      type: FakeSessionType.TRACKED,
    }))
    const renewSessionSpy = jasmine.createSpy()
    session.renewObservable.subscribe(renewSessionSpy)

    expireSession()

    expect(getCookie(FIRST_SESSION_TYPE_COOKIE)).toBeUndefined()
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    expect(renewSessionSpy).not.toHaveBeenCalled()
    expect(session.getType()).toBeUndefined()
    expect(session.getId()).toBeUndefined()

    document.dispatchEvent(new CustomEvent('click'))

    expect(renewSessionSpy).toHaveBeenCalled()
    expect(getCookie(FIRST_SESSION_TYPE_COOKIE)).toEqual(FakeSessionType.TRACKED)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)
  })

  describe('multiple startSessionManagement calls', () => {
    it('should re-use the same session id', () => {
      const firstSession = startSessionManagement(FIRST_SESSION_TYPE_COOKIE, () => ({
        isTracked: true,
        type: FakeSessionType.TRACKED,
      }))
      const idA = firstSession.getId()

      const secondSession = startSessionManagement(SECOND_SESSION_TYPE_COOKIE, () => ({
        isTracked: true,
        type: FakeSessionType.TRACKED,
      }))
      const idB = secondSession.getId()

      expect(idA).toBe(idB)
    })

    it('should have independent types', () => {
      const firstSession = startSessionManagement(FIRST_SESSION_TYPE_COOKIE, () => ({
        isTracked: true,
        type: FakeSessionType.TRACKED,
      }))
      const secondSession = startSessionManagement(SECOND_SESSION_TYPE_COOKIE, () => ({
        isTracked: false,
        type: FakeSessionType.NOT_TRACKED,
      }))

      expect(firstSession.getType()).toEqual(FakeSessionType.TRACKED)
      expect(secondSession.getType()).toEqual(FakeSessionType.NOT_TRACKED)
    })

    it('should notify each renew observables', () => {
      const firstSession = startSessionManagement(FIRST_SESSION_TYPE_COOKIE, () => ({
        isTracked: true,
        type: FakeSessionType.TRACKED,
      }))
      const renewSessionASpy = jasmine.createSpy()
      firstSession.renewObservable.subscribe(renewSessionASpy)

      const secondSession = startSessionManagement(SECOND_SESSION_TYPE_COOKIE, () => ({
        isTracked: true,
        type: FakeSessionType.TRACKED,
      }))
      const renewSessionBSpy = jasmine.createSpy()
      secondSession.renewObservable.subscribe(renewSessionBSpy)

      expireSession()

      expect(renewSessionASpy).not.toHaveBeenCalled()
      expect(renewSessionBSpy).not.toHaveBeenCalled()

      document.dispatchEvent(new CustomEvent('click'))

      expect(renewSessionASpy).toHaveBeenCalled()
      expect(renewSessionBSpy).toHaveBeenCalled()
    })
  })
})

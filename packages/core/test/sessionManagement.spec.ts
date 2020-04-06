import { cacheCookieAccess, COOKIE_ACCESS_DELAY, CookieCache, getCookie, setCookie } from '../src/cookie'
import {
  OLD_SESSION_COOKIE_NAME,
  Session,
  SESSION_COOKIE_NAME,
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
  NOT_TRACKED = 'not-tracked',
  TRACKED = 'tracked',
}
describe('startSessionManagement', () => {
  const DURATION = 123456
  const FIRST_SESSION_TYPE_OLD_COOKIE = 'foo'
  const SECOND_SESSION_TYPE_OLD_COOKIE = 'bar'
  const FIRST_SESSION_TYPE_KEY = 'first'
  const SECOND_SESSION_TYPE_KEY = 'second'

  function expireSession() {
    setCookie(SESSION_COOKIE_NAME, '', DURATION)
    setCookie(OLD_SESSION_COOKIE_NAME, '', DURATION)
    setCookie(FIRST_SESSION_TYPE_OLD_COOKIE, '', DURATION)
    setCookie(SECOND_SESSION_TYPE_OLD_COOKIE, '', DURATION)
    jasmine.clock().tick(COOKIE_ACCESS_DELAY)
  }

  function expectSessionIdToBe(session: Session<unknown>, sessionId: string) {
    expect(session.getId()).toBe(sessionId)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`id=${sessionId}`)
    expect(getCookie(OLD_SESSION_COOKIE_NAME)).toContain(sessionId)
  }

  function expectSessionIdToBeDefined(session: Session<unknown>) {
    expect(session.getId()).toMatch(/^[a-f0-9-]+$/)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]+/)
    expect(getCookie(OLD_SESSION_COOKIE_NAME)).toMatch(/[a-f0-9-]+/)
  }

  function expectSessionIdToNotBeDefined(session: Session<unknown>) {
    expect(session.getId()).toBeUndefined()
    expect(getCookie(SESSION_COOKIE_NAME)).not.toContain('id=')
    expect(getCookie(OLD_SESSION_COOKIE_NAME)).toBeUndefined()
  }

  function expectSessionTypeToBe(
    session: Session<unknown>,
    sessionTypeKey: string,
    oldTypeCookieName: string,
    sessionTypeValue: string
  ) {
    expect(session.getType()).toEqual(sessionTypeValue)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${sessionTypeKey}=${sessionTypeValue}`)
    expect(getCookie(oldTypeCookieName)).toEqual(sessionTypeValue)
  }

  function expectSessionTypeToNotBeDefined(
    session: Session<unknown>,
    sessionTypeKey: string,
    oldTypeCookieName: string
  ) {
    expect(session.getType()).toBeUndefined()
    expect(getCookie(SESSION_COOKIE_NAME)).not.toContain(`${sessionTypeKey}=`)
    expect(getCookie(oldTypeCookieName)).toBeUndefined()
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
    const session = startSessionManagement(FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE, () => ({
      isTracked: true,
      type: FakeSessionType.TRACKED,
    }))

    expectSessionIdToBeDefined(session)
    expectSessionTypeToBe(session, FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE, FakeSessionType.TRACKED)
  })

  it('when not tracked should store session type', () => {
    const session = startSessionManagement(FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE, () => ({
      isTracked: false,
      type: FakeSessionType.NOT_TRACKED,
    }))

    expectSessionIdToNotBeDefined(session)
    expectSessionTypeToBe(session, FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE, FakeSessionType.NOT_TRACKED)
  })

  it('when tracked should keep existing session type and id', () => {
    setCookie(SESSION_COOKIE_NAME, 'id=abcdef&first=tracked', DURATION)

    const session = startSessionManagement(FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE, () => ({
      isTracked: true,
      type: FakeSessionType.TRACKED,
    }))

    expectSessionIdToBe(session, 'abcdef')
    expectSessionTypeToBe(session, FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE, FakeSessionType.TRACKED)
  })

  it('when not tracked should keep existing session type', () => {
    setCookie(SESSION_COOKIE_NAME, 'first=not-tracked', DURATION)

    const session = startSessionManagement(FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE, () => ({
      isTracked: false,
      type: FakeSessionType.NOT_TRACKED,
    }))

    expectSessionIdToNotBeDefined(session)
    expectSessionTypeToBe(session, FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE, FakeSessionType.NOT_TRACKED)
  })

  describe('computeSessionState', () => {
    let spy: (rawType?: string) => { type: FakeSessionType; isTracked: boolean }

    beforeEach(() => {
      spy = jasmine.createSpy().and.returnValue({ isTracked: true, type: FakeSessionType.TRACKED })
    })

    it('should be called with an empty value if the cookie is not defined', () => {
      startSessionManagement(FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE, spy)
      expect(spy).toHaveBeenCalledWith(undefined)
    })

    it('should be called with an invalid value if the cookie has an invalid value', () => {
      setCookie(SESSION_COOKIE_NAME, 'first=invalid', DURATION)
      startSessionManagement(FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE, spy)
      expect(spy).toHaveBeenCalledWith('invalid')
    })

    it('should be called with the TRACKED type', () => {
      setCookie(SESSION_COOKIE_NAME, 'first=tracked', DURATION)
      startSessionManagement(FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE, spy)
      expect(spy).toHaveBeenCalledWith(FakeSessionType.TRACKED)
    })

    it('should be called with the NOT_TRACKED type', () => {
      setCookie(SESSION_COOKIE_NAME, 'first=not-tracked', DURATION)
      startSessionManagement(FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE, spy)
      expect(spy).toHaveBeenCalledWith(FakeSessionType.NOT_TRACKED)
    })
  })

  it('should renew on activity after expiration', () => {
    const session = startSessionManagement(FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE, () => ({
      isTracked: true,
      type: FakeSessionType.TRACKED,
    }))
    const renewSessionSpy = jasmine.createSpy()
    session.renewObservable.subscribe(renewSessionSpy)

    expireSession()

    expect(renewSessionSpy).not.toHaveBeenCalled()
    expectSessionIdToNotBeDefined(session)
    expectSessionTypeToNotBeDefined(session, FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE)

    document.dispatchEvent(new CustomEvent('click'))

    expect(renewSessionSpy).toHaveBeenCalled()
    expectSessionIdToBeDefined(session)
    expectSessionTypeToBe(session, FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE, FakeSessionType.TRACKED)
  })

  describe('multiple startSessionManagement calls', () => {
    it('should re-use the same session id', () => {
      const firstSession = startSessionManagement(FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE, () => ({
        isTracked: true,
        type: FakeSessionType.TRACKED,
      }))
      const idA = firstSession.getId()

      const secondSession = startSessionManagement(SECOND_SESSION_TYPE_KEY, SECOND_SESSION_TYPE_OLD_COOKIE, () => ({
        isTracked: true,
        type: FakeSessionType.TRACKED,
      }))
      const idB = secondSession.getId()

      expect(idA).toBe(idB)
    })

    it('should have independent types', () => {
      const firstSession = startSessionManagement(FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE, () => ({
        isTracked: true,
        type: FakeSessionType.TRACKED,
      }))
      const secondSession = startSessionManagement(SECOND_SESSION_TYPE_KEY, SECOND_SESSION_TYPE_OLD_COOKIE, () => ({
        isTracked: false,
        type: FakeSessionType.NOT_TRACKED,
      }))

      expect(firstSession.getType()).toEqual(FakeSessionType.TRACKED)
      expect(secondSession.getType()).toEqual(FakeSessionType.NOT_TRACKED)
    })

    it('should notify each renew observables', () => {
      const firstSession = startSessionManagement(FIRST_SESSION_TYPE_KEY, FIRST_SESSION_TYPE_OLD_COOKIE, () => ({
        isTracked: true,
        type: FakeSessionType.TRACKED,
      }))
      const renewSessionASpy = jasmine.createSpy()
      firstSession.renewObservable.subscribe(renewSessionASpy)

      const secondSession = startSessionManagement(SECOND_SESSION_TYPE_KEY, SECOND_SESSION_TYPE_OLD_COOKIE, () => ({
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

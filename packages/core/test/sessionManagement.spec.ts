import { ONE_HOUR } from '../src'
import { cacheCookieAccess, COOKIE_ACCESS_DELAY, CookieCache, getCookie, setCookie } from '../src/cookie'
import {
  Session,
  SESSION_COOKIE_NAME,
  SESSION_EXPIRATION_DELAY,
  SESSION_TIME_OUT_DELAY,
  startSessionManagement,
  stopSessionManagement,
  VISIBILITY_CHECK_DELAY,
} from '../src/sessionManagement'
import { isIE, restorePageVisibility, setPageVisibility } from '../src/specHelper'

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

enum FakeTrackingType {
  NOT_TRACKED = 'not-tracked',
  TRACKED = 'tracked',
}
describe('startSessionManagement', () => {
  const DURATION = 123456
  const FIRST_PRODUCT_KEY = 'first'
  const SECOND_PRODUCT_KEY = 'second'

  function expireSession() {
    setCookie(SESSION_COOKIE_NAME, '', DURATION)
    jasmine.clock().tick(COOKIE_ACCESS_DELAY)
  }

  function expectSessionIdToBe(session: Session<unknown>, sessionId: string) {
    expect(session.getId()).toBe(sessionId)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`id=${sessionId}`)
  }

  function expectSessionIdToBeDefined(session: Session<unknown>) {
    expect(session.getId()).toMatch(/^[a-f0-9-]+$/)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]+/)
  }

  function expectSessionIdToNotBeDefined(session: Session<unknown>) {
    expect(session.getId()).toBeUndefined()
    expect(getCookie(SESSION_COOKIE_NAME)).not.toContain('id=')
  }

  function expectTrackingTypeToBe(session: Session<unknown>, productKey: string, trackingType: string) {
    expect(session.getTrackingType()).toEqual(trackingType)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${productKey}=${trackingType}`)
  }

  function expectTrackingTypeToNotBeDefined(session: Session<unknown>, productKey: string) {
    expect(session.getTrackingType()).toBeUndefined()
    expect(getCookie(SESSION_COOKIE_NAME)).not.toContain(`${productKey}=`)
  }

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date())
  })

  afterEach(() => {
    // remove intervals first
    stopSessionManagement()
    // flush pending callbacks to avoid random failures
    jasmine.clock().tick(ONE_HOUR)
    jasmine.clock().uninstall()
  })

  describe('cookie management', () => {
    it('when tracked, should store tracking type and session id', () => {
      const session = startSessionManagement(FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))

      expectSessionIdToBeDefined(session)
      expectTrackingTypeToBe(session, FIRST_PRODUCT_KEY, FakeTrackingType.TRACKED)
    })

    it('when not tracked should store tracking type', () => {
      const session = startSessionManagement(FIRST_PRODUCT_KEY, () => ({
        isTracked: false,
        trackingType: FakeTrackingType.NOT_TRACKED,
      }))

      expectSessionIdToNotBeDefined(session)
      expectTrackingTypeToBe(session, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)
    })

    it('when tracked should keep existing tracking type and session id', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&first=tracked', DURATION)

      const session = startSessionManagement(FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))

      expectSessionIdToBe(session, 'abcdef')
      expectTrackingTypeToBe(session, FIRST_PRODUCT_KEY, FakeTrackingType.TRACKED)
    })

    it('when not tracked should keep existing tracking type', () => {
      setCookie(SESSION_COOKIE_NAME, 'first=not-tracked', DURATION)

      const session = startSessionManagement(FIRST_PRODUCT_KEY, () => ({
        isTracked: false,
        trackingType: FakeTrackingType.NOT_TRACKED,
      }))

      expectSessionIdToNotBeDefined(session)
      expectTrackingTypeToBe(session, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)
    })
  })

  describe('computeSessionState', () => {
    let spy: (rawTrackingType?: string) => { trackingType: FakeTrackingType; isTracked: boolean }

    beforeEach(() => {
      spy = jasmine.createSpy().and.returnValue({ isTracked: true, trackingType: FakeTrackingType.TRACKED })
    })

    it('should be called with an empty value if the cookie is not defined', () => {
      startSessionManagement(FIRST_PRODUCT_KEY, spy)
      expect(spy).toHaveBeenCalledWith(undefined)
    })

    it('should be called with an invalid value if the cookie has an invalid value', () => {
      setCookie(SESSION_COOKIE_NAME, 'first=invalid', DURATION)
      startSessionManagement(FIRST_PRODUCT_KEY, spy)
      expect(spy).toHaveBeenCalledWith('invalid')
    })

    it('should be called with TRACKED', () => {
      setCookie(SESSION_COOKIE_NAME, 'first=tracked', DURATION)
      startSessionManagement(FIRST_PRODUCT_KEY, spy)
      expect(spy).toHaveBeenCalledWith(FakeTrackingType.TRACKED)
    })

    it('should be called with NOT_TRACKED', () => {
      setCookie(SESSION_COOKIE_NAME, 'first=not-tracked', DURATION)
      startSessionManagement(FIRST_PRODUCT_KEY, spy)
      expect(spy).toHaveBeenCalledWith(FakeTrackingType.NOT_TRACKED)
    })
  })

  describe('session renewal', () => {
    it('should renew on activity after expiration', () => {
      const session = startSessionManagement(FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const renewSessionSpy = jasmine.createSpy()
      session.renewObservable.subscribe(renewSessionSpy)

      expireSession()

      expect(renewSessionSpy).not.toHaveBeenCalled()
      expectSessionIdToNotBeDefined(session)
      expectTrackingTypeToNotBeDefined(session, FIRST_PRODUCT_KEY)

      document.dispatchEvent(new CustomEvent('click'))

      expect(renewSessionSpy).toHaveBeenCalled()
      expectSessionIdToBeDefined(session)
      expectTrackingTypeToBe(session, FIRST_PRODUCT_KEY, FakeTrackingType.TRACKED)
    })
  })

  describe('multiple startSessionManagement calls', () => {
    it('should re-use the same session id', () => {
      const firstSession = startSessionManagement(FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const idA = firstSession.getId()

      const secondSession = startSessionManagement(SECOND_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const idB = secondSession.getId()

      expect(idA).toBe(idB)
    })

    it('should have independent tracking types', () => {
      const firstSession = startSessionManagement(FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const secondSession = startSessionManagement(SECOND_PRODUCT_KEY, () => ({
        isTracked: false,
        trackingType: FakeTrackingType.NOT_TRACKED,
      }))

      expect(firstSession.getTrackingType()).toEqual(FakeTrackingType.TRACKED)
      expect(secondSession.getTrackingType()).toEqual(FakeTrackingType.NOT_TRACKED)
    })

    it('should notify each renew observables', () => {
      const firstSession = startSessionManagement(FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const renewSessionASpy = jasmine.createSpy()
      firstSession.renewObservable.subscribe(renewSessionASpy)

      const secondSession = startSessionManagement(SECOND_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
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

  describe('session timeout', () => {
    it('should expire the session when the time out delay is reached', () => {
      const session = startSessionManagement(FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      expect(session.getId()).toBeDefined()
      expect(getCookie(SESSION_COOKIE_NAME)).toBeDefined()

      jasmine.clock().tick(SESSION_TIME_OUT_DELAY)
      expect(session.getId()).toBeUndefined()
      expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    })

    it('should renew an existing timed out session', () => {
      setCookie(SESSION_COOKIE_NAME, `id=abcde&first=tracked&created=${Date.now() - SESSION_TIME_OUT_DELAY}`, DURATION)

      const session = startSessionManagement(FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))

      expect(session.getId()).not.toBe('abcde')
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(`created=${Date.now()}`)
    })

    it('should not add created date to an existing session from an older versions', () => {
      setCookie(SESSION_COOKIE_NAME, `id=abcde&first=tracked`, DURATION)

      const session = startSessionManagement(FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))

      expect(session.getId()).toBe('abcde')
      expect(getCookie(SESSION_COOKIE_NAME)).not.toContain('created=')
    })
  })

  describe('session expiration', () => {
    beforeEach(() => {
      setPageVisibility('hidden')
    })

    afterEach(() => {
      restorePageVisibility()
    })

    it('should expire the session after expiration delay', () => {
      const session = startSessionManagement(FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      expectSessionIdToBeDefined(session)

      jasmine.clock().tick(SESSION_EXPIRATION_DELAY)
      expectSessionIdToNotBeDefined(session)
    })

    it('should expand duration on activity', () => {
      const session = startSessionManagement(FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      expectSessionIdToBeDefined(session)

      jasmine.clock().tick(SESSION_EXPIRATION_DELAY - 10)
      document.dispatchEvent(new CustomEvent('click'))

      jasmine.clock().tick(10)
      expectSessionIdToBeDefined(session)

      jasmine.clock().tick(SESSION_EXPIRATION_DELAY)
      expectSessionIdToNotBeDefined(session)
    })

    it('should expand session on visibility', () => {
      setPageVisibility('visible')

      const session = startSessionManagement(FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))

      jasmine.clock().tick(3 * VISIBILITY_CHECK_DELAY)
      setPageVisibility('hidden')
      expectSessionIdToBeDefined(session)

      jasmine.clock().tick(SESSION_EXPIRATION_DELAY - 10)
      expectSessionIdToBeDefined(session)

      jasmine.clock().tick(10)
      expectSessionIdToNotBeDefined(session)
    })
  })
})

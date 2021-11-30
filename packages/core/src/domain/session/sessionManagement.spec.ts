import { COOKIE_ACCESS_DELAY, CookieOptions, getCookie, setCookie } from '../../browser/cookie'
import { Clock, mockClock, restorePageVisibility, setPageVisibility, createNewEvent } from '../../../test/specHelper'
import { ONE_HOUR, DOM_EVENT, ONE_SECOND } from '../../tools/utils'
import { RelativeTime } from '../../tools/timeUtils'
import { isIE } from '../../tools/browserDetection'
import { Session, startSessionManagement, stopSessionManagement, VISIBILITY_CHECK_DELAY } from './sessionManagement'
import { SESSION_COOKIE_NAME, SESSION_TIME_OUT_DELAY, SESSION_EXPIRATION_DELAY } from './sessionStore'

enum FakeTrackingType {
  NOT_TRACKED = 'not-tracked',
  TRACKED = 'tracked',
}
describe('startSessionManagement', () => {
  const DURATION = 123456
  const FIRST_PRODUCT_KEY = 'first'
  const SECOND_PRODUCT_KEY = 'second'
  const COOKIE_OPTIONS: CookieOptions = {}
  let clock: Clock

  function expireSession() {
    setCookie(SESSION_COOKIE_NAME, '', DURATION)
    clock.tick(COOKIE_ACCESS_DELAY)
  }

  function expectSessionIdToBe(session: Session<FakeTrackingType>, sessionId: string) {
    expect(session.getId()).toBe(sessionId)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`id=${sessionId}`)
  }

  function expectSessionIdToBeDefined(session: Session<FakeTrackingType>) {
    expect(session.getId()).toMatch(/^[a-f0-9-]+$/)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]+/)
  }

  function expectSessionIdToNotBeDefined(session: Session<FakeTrackingType>) {
    expect(session.getId()).toBeUndefined()
    expect(getCookie(SESSION_COOKIE_NAME)).not.toContain('id=')
  }

  function expectTrackingTypeToBe(
    session: Session<FakeTrackingType>,
    productKey: string,
    trackingType: FakeTrackingType
  ) {
    expect(session.getTrackingType()).toEqual(trackingType)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${productKey}=${trackingType}`)
  }

  function expectTrackingTypeToNotBeDefined(session: Session<FakeTrackingType>, productKey: string) {
    expect(session.getTrackingType()).toBeUndefined()
    expect(getCookie(SESSION_COOKIE_NAME)).not.toContain(`${productKey}=`)
  }

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    clock = mockClock()
  })

  afterEach(() => {
    // remove intervals first
    stopSessionManagement()
    // flush pending callbacks to avoid random failures
    clock.tick(ONE_HOUR)
    clock.cleanup()
  })

  describe('cookie management', () => {
    it('when tracked, should store tracking type and session id', () => {
      const session = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))

      expectSessionIdToBeDefined(session)
      expectTrackingTypeToBe(session, FIRST_PRODUCT_KEY, FakeTrackingType.TRACKED)
    })

    it('when not tracked should store tracking type', () => {
      const session = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: false,
        trackingType: FakeTrackingType.NOT_TRACKED,
      }))

      expectSessionIdToNotBeDefined(session)
      expectTrackingTypeToBe(session, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)
    })

    it('when tracked should keep existing tracking type and session id', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&first=tracked', DURATION)

      const session = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))

      expectSessionIdToBe(session, 'abcdef')
      expectTrackingTypeToBe(session, FIRST_PRODUCT_KEY, FakeTrackingType.TRACKED)
    })

    it('when not tracked should keep existing tracking type', () => {
      setCookie(SESSION_COOKIE_NAME, 'first=not-tracked', DURATION)

      const session = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: false,
        trackingType: FakeTrackingType.NOT_TRACKED,
      }))

      expectSessionIdToNotBeDefined(session)
      expectTrackingTypeToBe(session, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)
    })
  })

  describe('cookie options', () => {
    ;[
      {
        cookieOptions: {},
        cookieString: /^_dd_s=[^;]*;expires=[^;]+;path=\/;samesite=strict$/,
        description: 'should set same-site to strict by default',
      },
      {
        cookieOptions: { crossSite: true },
        cookieString: /^_dd_s=[^;]*;expires=[^;]+;path=\/;samesite=none$/,
        description: 'should set same site to none for crossSite',
      },
      {
        cookieOptions: { secure: true },
        cookieString: /^_dd_s=[^;]*;expires=[^;]+;path=\/;samesite=strict;secure$/,
        description: 'should add secure attribute when defined',
      },
      {
        cookieOptions: { domain: 'foo.bar' },
        cookieString: /^_dd_s=[^;]*;expires=[^;]+;path=\/;samesite=strict;domain=foo\.bar$/,
        description: 'should set cookie domain when defined',
      },
    ].forEach(({ description, cookieOptions, cookieString }) => {
      it(description, () => {
        const cookieSetSpy = spyOnProperty(document, 'cookie', 'set')

        startSessionManagement(cookieOptions, FIRST_PRODUCT_KEY, () => ({
          isTracked: true,
          trackingType: FakeTrackingType.TRACKED,
        }))

        expect(cookieSetSpy.calls.argsFor(0)[0]).toMatch(cookieString)
      })
    })
  })

  describe('computeSessionState', () => {
    let spy: (rawTrackingType?: string) => { trackingType: FakeTrackingType; isTracked: boolean }

    beforeEach(() => {
      spy = jasmine.createSpy().and.returnValue({ isTracked: true, trackingType: FakeTrackingType.TRACKED })
    })

    it('should be called with an empty value if the cookie is not defined', () => {
      startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, spy)
      expect(spy).toHaveBeenCalledWith(undefined)
    })

    it('should be called with an invalid value if the cookie has an invalid value', () => {
      setCookie(SESSION_COOKIE_NAME, 'first=invalid', DURATION)
      startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, spy)
      expect(spy).toHaveBeenCalledWith('invalid')
    })

    it('should be called with TRACKED', () => {
      setCookie(SESSION_COOKIE_NAME, 'first=tracked', DURATION)
      startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, spy)
      expect(spy).toHaveBeenCalledWith(FakeTrackingType.TRACKED)
    })

    it('should be called with NOT_TRACKED', () => {
      setCookie(SESSION_COOKIE_NAME, 'first=not-tracked', DURATION)
      startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, spy)
      expect(spy).toHaveBeenCalledWith(FakeTrackingType.NOT_TRACKED)
    })
  })

  describe('session renewal', () => {
    it('should renew on activity after expiration', () => {
      const session = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
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

    it('should not renew on visibility after expiration', () => {
      const session = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const renewSessionSpy = jasmine.createSpy()
      session.renewObservable.subscribe(renewSessionSpy)

      expireSession()

      clock.tick(VISIBILITY_CHECK_DELAY)

      expect(renewSessionSpy).not.toHaveBeenCalled()
      expectSessionIdToNotBeDefined(session)
    })
  })

  describe('multiple startSessionManagement calls', () => {
    it('should re-use the same session id', () => {
      const firstSession = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const idA = firstSession.getId()

      const secondSession = startSessionManagement(COOKIE_OPTIONS, SECOND_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const idB = secondSession.getId()

      expect(idA).toBe(idB)
    })

    it('should not erase other session type', () => {
      startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))

      // schedule an expandOrRenewSession
      document.dispatchEvent(new CustomEvent('click'))

      clock.tick(COOKIE_ACCESS_DELAY / 2)

      // expand first session cookie cache
      document.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE))

      startSessionManagement(COOKIE_OPTIONS, SECOND_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))

      // cookie correctly set
      expect(getCookie(SESSION_COOKIE_NAME)).toContain('first')
      expect(getCookie(SESSION_COOKIE_NAME)).toContain('second')

      clock.tick(COOKIE_ACCESS_DELAY / 2)

      // scheduled expandOrRenewSession should not use cached value
      expect(getCookie(SESSION_COOKIE_NAME)).toContain('first')
      expect(getCookie(SESSION_COOKIE_NAME)).toContain('second')
    })

    it('should have independent tracking types', () => {
      const firstSession = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const secondSession = startSessionManagement(COOKIE_OPTIONS, SECOND_PRODUCT_KEY, () => ({
        isTracked: false,
        trackingType: FakeTrackingType.NOT_TRACKED,
      }))

      expect(firstSession.getTrackingType()).toEqual(FakeTrackingType.TRACKED)
      expect(secondSession.getTrackingType()).toEqual(FakeTrackingType.NOT_TRACKED)
    })

    it('should notify each expire and renew observables', () => {
      const firstSession = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const expireSessionASpy = jasmine.createSpy()
      firstSession.expireObservable.subscribe(expireSessionASpy)
      const renewSessionASpy = jasmine.createSpy()
      firstSession.renewObservable.subscribe(renewSessionASpy)

      const secondSession = startSessionManagement(COOKIE_OPTIONS, SECOND_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const expireSessionBSpy = jasmine.createSpy()
      secondSession.expireObservable.subscribe(expireSessionBSpy)
      const renewSessionBSpy = jasmine.createSpy()
      secondSession.renewObservable.subscribe(renewSessionBSpy)

      expireSession()

      expect(expireSessionASpy).toHaveBeenCalled()
      expect(expireSessionBSpy).toHaveBeenCalled()
      expect(renewSessionASpy).not.toHaveBeenCalled()
      expect(renewSessionBSpy).not.toHaveBeenCalled()

      document.dispatchEvent(new CustomEvent('click'))

      expect(renewSessionASpy).toHaveBeenCalled()
      expect(renewSessionBSpy).toHaveBeenCalled()
    })
  })

  describe('session timeout', () => {
    it('should expire the session when the time out delay is reached', () => {
      const session = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const expireSessionSpy = jasmine.createSpy()
      session.expireObservable.subscribe(expireSessionSpy)

      expect(session.getId()).toBeDefined()
      expect(getCookie(SESSION_COOKIE_NAME)).toBeDefined()

      clock.tick(SESSION_TIME_OUT_DELAY)
      expect(session.getId()).toBeUndefined()
      expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should renew an existing timed out session', () => {
      setCookie(SESSION_COOKIE_NAME, `id=abcde&first=tracked&created=${Date.now() - SESSION_TIME_OUT_DELAY}`, DURATION)

      const session = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const expireSessionSpy = jasmine.createSpy()
      session.expireObservable.subscribe(expireSessionSpy)

      expect(session.getId()).not.toBe('abcde')
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(`created=${Date.now()}`)
      expect(expireSessionSpy).not.toHaveBeenCalled() // the session has not been active from the start
    })

    it('should not add created date to an existing session from an older versions', () => {
      setCookie(SESSION_COOKIE_NAME, `id=abcde&first=tracked`, DURATION)

      const session = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
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
      const session = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const expireSessionSpy = jasmine.createSpy()
      session.expireObservable.subscribe(expireSessionSpy)

      expectSessionIdToBeDefined(session)

      clock.tick(SESSION_EXPIRATION_DELAY)
      expectSessionIdToNotBeDefined(session)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should expand duration on activity', () => {
      const session = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const expireSessionSpy = jasmine.createSpy()
      session.expireObservable.subscribe(expireSessionSpy)

      expectSessionIdToBeDefined(session)

      clock.tick(SESSION_EXPIRATION_DELAY - 10)
      document.dispatchEvent(new CustomEvent('click'))

      clock.tick(10)
      expectSessionIdToBeDefined(session)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(SESSION_EXPIRATION_DELAY)
      expectSessionIdToNotBeDefined(session)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should expand session on visibility', () => {
      setPageVisibility('visible')

      const session = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const expireSessionSpy = jasmine.createSpy()
      session.expireObservable.subscribe(expireSessionSpy)

      clock.tick(3 * VISIBILITY_CHECK_DELAY)
      setPageVisibility('hidden')
      expectSessionIdToBeDefined(session)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(SESSION_EXPIRATION_DELAY - 10)
      expectSessionIdToBeDefined(session)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(10)
      expectSessionIdToNotBeDefined(session)
      expect(expireSessionSpy).toHaveBeenCalled()
    })
  })

  describe('session history', () => {
    it('should return undefined when there is no current session and no startTime', () => {
      const session = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      expireSession()

      expect(session.getId()).toBeUndefined()
      expect(session.getTrackingType()).toBeUndefined()
    })

    it('should return the current session context when there is no start time', () => {
      const session = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))

      expect(session.getId()).toBeDefined()
      expect(session.getTrackingType()).toBeDefined()
    })

    it('should return the session context corresponding to startTime', () => {
      const session = startSessionManagement(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))

      // 0 - 10s first session
      clock.tick(10 * ONE_SECOND - COOKIE_ACCESS_DELAY)
      const firstSessionId = session.getId()
      const firstSessionTrackingType = session.getTrackingType()
      expireSession()

      // 10 - 20s no session
      clock.tick(10 * ONE_SECOND)

      // 20s - end second session
      document.dispatchEvent(new CustomEvent('click'))
      clock.tick(10 * ONE_SECOND)
      const secondSessionId = session.getId()
      const secondSessionTrackingType = session.getTrackingType()

      expect(session.getId((5 * ONE_SECOND) as RelativeTime)).toBe(firstSessionId)
      expect(session.getTrackingType((5 * ONE_SECOND) as RelativeTime)).toBe(firstSessionTrackingType)
      expect(session.getId((15 * ONE_SECOND) as RelativeTime)).toBeUndefined()
      expect(session.getTrackingType((15 * ONE_SECOND) as RelativeTime)).toBeUndefined()
      expect(session.getId((25 * ONE_SECOND) as RelativeTime)).toBe(secondSessionId)
      expect(session.getTrackingType((25 * ONE_SECOND) as RelativeTime)).toBe(secondSessionTrackingType)
    })
  })
})

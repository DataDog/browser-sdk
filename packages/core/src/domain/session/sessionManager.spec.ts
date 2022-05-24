import type { CookieOptions } from '../../browser/cookie'
import { COOKIE_ACCESS_DELAY, getCookie, setCookie } from '../../browser/cookie'
import type { Clock } from '../../../test/specHelper'
import { mockClock, restorePageVisibility, setPageVisibility, createNewEvent } from '../../../test/specHelper'
import { ONE_HOUR, DOM_EVENT, ONE_SECOND } from '../../tools/utils'
import type { RelativeTime } from '../../tools/timeUtils'
import { isIE } from '../../tools/browserDetection'
import type { SessionManager } from './sessionManager'
import { startSessionManager, stopSessionManager, VISIBILITY_CHECK_DELAY } from './sessionManager'
import { SESSION_COOKIE_NAME } from './sessionCookieStore'
import { SESSION_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY } from './sessionConstants'

const enum FakeTrackingType {
  NOT_TRACKED = 'not-tracked',
  TRACKED = 'tracked',
}
describe('startSessionManager', () => {
  const DURATION = 123456
  const FIRST_PRODUCT_KEY = 'first'
  const SECOND_PRODUCT_KEY = 'second'
  const COOKIE_OPTIONS: CookieOptions = {}
  let clock: Clock

  function expireSession() {
    setCookie(SESSION_COOKIE_NAME, '', DURATION)
    clock.tick(COOKIE_ACCESS_DELAY)
  }

  function expectSessionIdToBe(sessionManager: SessionManager<FakeTrackingType>, sessionId: string) {
    expect(sessionManager.findActiveSession()!.id).toBe(sessionId)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`id=${sessionId}`)
  }

  function expectSessionIdToBeDefined(sessionManager: SessionManager<FakeTrackingType>) {
    expect(sessionManager.findActiveSession()!.id).toMatch(/^[a-f0-9-]+$/)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]+/)
  }

  function expectSessionIdToNotBeDefined(sessionManager: SessionManager<FakeTrackingType>) {
    expect(sessionManager.findActiveSession()?.id).toBeUndefined()
    expect(getCookie(SESSION_COOKIE_NAME)).not.toContain('id=')
  }

  function expectTrackingTypeToBe(
    sessionManager: SessionManager<FakeTrackingType>,
    productKey: string,
    trackingType: FakeTrackingType
  ) {
    expect(sessionManager.findActiveSession()!.trackingType).toEqual(trackingType)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${productKey}=${trackingType}`)
  }

  function expectTrackingTypeToNotBeDefined(sessionManager: SessionManager<FakeTrackingType>, productKey: string) {
    expect(sessionManager.findActiveSession()?.trackingType).toBeUndefined()
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
    stopSessionManager()
    // flush pending callbacks to avoid random failures
    clock.tick(ONE_HOUR)
    clock.cleanup()
  })

  describe('cookie management', () => {
    it('when tracked, should store tracking type and session id', () => {
      const sessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))

      expectSessionIdToBeDefined(sessionManager)
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.TRACKED)
    })

    it('when not tracked should store tracking type', () => {
      const sessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: false,
        trackingType: FakeTrackingType.NOT_TRACKED,
      }))

      expectSessionIdToNotBeDefined(sessionManager)
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)
    })

    it('when tracked should keep existing tracking type and session id', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&first=tracked', DURATION)

      const sessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))

      expectSessionIdToBe(sessionManager, 'abcdef')
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.TRACKED)
    })

    it('when not tracked should keep existing tracking type', () => {
      setCookie(SESSION_COOKIE_NAME, 'first=not-tracked', DURATION)

      const sessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: false,
        trackingType: FakeTrackingType.NOT_TRACKED,
      }))

      expectSessionIdToNotBeDefined(sessionManager)
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)
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

        startSessionManager(cookieOptions, FIRST_PRODUCT_KEY, () => ({
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
      startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, spy)
      expect(spy).toHaveBeenCalledWith(undefined)
    })

    it('should be called with an invalid value if the cookie has an invalid value', () => {
      setCookie(SESSION_COOKIE_NAME, 'first=invalid', DURATION)
      startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, spy)
      expect(spy).toHaveBeenCalledWith('invalid')
    })

    it('should be called with TRACKED', () => {
      setCookie(SESSION_COOKIE_NAME, 'first=tracked', DURATION)
      startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, spy)
      expect(spy).toHaveBeenCalledWith(FakeTrackingType.TRACKED)
    })

    it('should be called with NOT_TRACKED', () => {
      setCookie(SESSION_COOKIE_NAME, 'first=not-tracked', DURATION)
      startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, spy)
      expect(spy).toHaveBeenCalledWith(FakeTrackingType.NOT_TRACKED)
    })
  })

  describe('session renewal', () => {
    it('should renew on activity after expiration', () => {
      const sessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const renewSessionSpy = jasmine.createSpy()
      sessionManager.renewObservable.subscribe(renewSessionSpy)

      expireSession()

      expect(renewSessionSpy).not.toHaveBeenCalled()
      expectSessionIdToNotBeDefined(sessionManager)
      expectTrackingTypeToNotBeDefined(sessionManager, FIRST_PRODUCT_KEY)

      document.dispatchEvent(new CustomEvent('click'))

      expect(renewSessionSpy).toHaveBeenCalled()
      expectSessionIdToBeDefined(sessionManager)
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.TRACKED)
    })

    it('should not renew on visibility after expiration', () => {
      const sessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const renewSessionSpy = jasmine.createSpy()
      sessionManager.renewObservable.subscribe(renewSessionSpy)

      expireSession()

      clock.tick(VISIBILITY_CHECK_DELAY)

      expect(renewSessionSpy).not.toHaveBeenCalled()
      expectSessionIdToNotBeDefined(sessionManager)
    })
  })

  describe('multiple startSessionManager calls', () => {
    it('should re-use the same session id', () => {
      const firstSessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const idA = firstSessionManager.findActiveSession()!.id

      const secondSessionManager = startSessionManager(COOKIE_OPTIONS, SECOND_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const idB = secondSessionManager.findActiveSession()!.id

      expect(idA).toBe(idB)
    })

    it('should not erase other session type', () => {
      startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))

      // schedule an expandOrRenewSession
      document.dispatchEvent(new CustomEvent('click'))

      clock.tick(COOKIE_ACCESS_DELAY / 2)

      // expand first session cookie cache
      document.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE))

      startSessionManager(COOKIE_OPTIONS, SECOND_PRODUCT_KEY, () => ({
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
      const firstSessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const secondSessionManager = startSessionManager(COOKIE_OPTIONS, SECOND_PRODUCT_KEY, () => ({
        isTracked: false,
        trackingType: FakeTrackingType.NOT_TRACKED,
      }))

      expect(firstSessionManager.findActiveSession()!.trackingType).toEqual(FakeTrackingType.TRACKED)
      expect(secondSessionManager.findActiveSession()!.trackingType).toEqual(FakeTrackingType.NOT_TRACKED)
    })

    it('should notify each expire and renew observables', () => {
      const firstSessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const expireSessionASpy = jasmine.createSpy()
      firstSessionManager.expireObservable.subscribe(expireSessionASpy)
      const renewSessionASpy = jasmine.createSpy()
      firstSessionManager.renewObservable.subscribe(renewSessionASpy)

      const secondSessionManager = startSessionManager(COOKIE_OPTIONS, SECOND_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const expireSessionBSpy = jasmine.createSpy()
      secondSessionManager.expireObservable.subscribe(expireSessionBSpy)
      const renewSessionBSpy = jasmine.createSpy()
      secondSessionManager.renewObservable.subscribe(renewSessionBSpy)

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
      const sessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expect(sessionManager.findActiveSession()).toBeDefined()
      expect(getCookie(SESSION_COOKIE_NAME)).toBeDefined()

      clock.tick(SESSION_TIME_OUT_DELAY)
      expect(sessionManager.findActiveSession()).toBeUndefined()
      expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should renew an existing timed out session', () => {
      setCookie(SESSION_COOKIE_NAME, `id=abcde&first=tracked&created=${Date.now() - SESSION_TIME_OUT_DELAY}`, DURATION)

      const sessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expect(sessionManager.findActiveSession()!.id).not.toBe('abcde')
      expect(getCookie(SESSION_COOKIE_NAME)).toContain(`created=${Date.now()}`)
      expect(expireSessionSpy).not.toHaveBeenCalled() // the session has not been active from the start
    })

    it('should not add created date to an existing session from an older versions', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcde&first=tracked', DURATION)

      const sessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))

      expect(sessionManager.findActiveSession()!.id).toBe('abcde')
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
      const sessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expectSessionIdToBeDefined(sessionManager)

      clock.tick(SESSION_EXPIRATION_DELAY)
      expectSessionIdToNotBeDefined(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should expand duration on activity', () => {
      const sessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expectSessionIdToBeDefined(sessionManager)

      clock.tick(SESSION_EXPIRATION_DELAY - 10)
      document.dispatchEvent(new CustomEvent('click'))

      clock.tick(10)
      expectSessionIdToBeDefined(sessionManager)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(SESSION_EXPIRATION_DELAY)
      expectSessionIdToNotBeDefined(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should expand not tracked session duration on activity', () => {
      const sessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: false,
        trackingType: FakeTrackingType.NOT_TRACKED,
      }))
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)

      clock.tick(SESSION_EXPIRATION_DELAY - 10)
      document.dispatchEvent(new CustomEvent('click'))

      clock.tick(10)
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(SESSION_EXPIRATION_DELAY)
      expectTrackingTypeToNotBeDefined(sessionManager, FIRST_PRODUCT_KEY)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should expand session on visibility', () => {
      setPageVisibility('visible')

      const sessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      clock.tick(3 * VISIBILITY_CHECK_DELAY)
      setPageVisibility('hidden')
      expectSessionIdToBeDefined(sessionManager)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(SESSION_EXPIRATION_DELAY - 10)
      expectSessionIdToBeDefined(sessionManager)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(10)
      expectSessionIdToNotBeDefined(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should expand not tracked session on visibility', () => {
      setPageVisibility('visible')

      const sessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: false,
        trackingType: FakeTrackingType.NOT_TRACKED,
      }))
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      clock.tick(3 * VISIBILITY_CHECK_DELAY)
      setPageVisibility('hidden')
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(SESSION_EXPIRATION_DELAY - 10)
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(10)
      expectTrackingTypeToNotBeDefined(sessionManager, FIRST_PRODUCT_KEY)
      expect(expireSessionSpy).toHaveBeenCalled()
    })
  })

  describe('session history', () => {
    it('should return undefined when there is no current session and no startTime', () => {
      const sessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))
      expireSession()

      expect(sessionManager.findActiveSession()).toBeUndefined()
    })

    it('should return the current session context when there is no start time', () => {
      const sessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))

      expect(sessionManager.findActiveSession()!.id).toBeDefined()
      expect(sessionManager.findActiveSession()!.trackingType).toBeDefined()
    })

    it('should return the session context corresponding to startTime', () => {
      const sessionManager = startSessionManager(COOKIE_OPTIONS, FIRST_PRODUCT_KEY, () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      }))

      // 0s to 10s: first session
      clock.tick(10 * ONE_SECOND - COOKIE_ACCESS_DELAY)
      const firstSessionId = sessionManager.findActiveSession()!.id
      const firstSessionTrackingType = sessionManager.findActiveSession()!.trackingType
      expireSession()

      // 10s to 20s: no session
      clock.tick(10 * ONE_SECOND)

      // 20s to end: second session
      document.dispatchEvent(new CustomEvent('click'))
      clock.tick(10 * ONE_SECOND)
      const secondSessionId = sessionManager.findActiveSession()!.id
      const secondSessionTrackingType = sessionManager.findActiveSession()!.trackingType

      expect(sessionManager.findActiveSession((5 * ONE_SECOND) as RelativeTime)!.id).toBe(firstSessionId)
      expect(sessionManager.findActiveSession((5 * ONE_SECOND) as RelativeTime)!.trackingType).toBe(
        firstSessionTrackingType
      )
      expect(sessionManager.findActiveSession((15 * ONE_SECOND) as RelativeTime)).toBeUndefined()
      expect(sessionManager.findActiveSession((25 * ONE_SECOND) as RelativeTime)!.id).toBe(secondSessionId)
      expect(sessionManager.findActiveSession((25 * ONE_SECOND) as RelativeTime)!.trackingType).toBe(
        secondSessionTrackingType
      )
    })
  })
})

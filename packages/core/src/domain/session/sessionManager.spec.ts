import {
  createNewEvent,
  expireCookie,
  getSessionState,
  mockClock,
  registerCleanupTask,
  restorePageVisibility,
  setPageVisibility,
} from '../../../test'
import type { Clock } from '../../../test'
import { getCookie, setCookie } from '../../browser/cookie'
import { DOM_EVENT } from '../../browser/addEventListener'
import { ONE_HOUR, ONE_SECOND } from '../../tools/utils/timeUtils'
import type { Configuration } from '../configuration'
import type { TrackingConsentState } from '../trackingConsent'
import { TrackingConsent, createTrackingConsentState } from '../trackingConsent'
import type { SessionManager } from './sessionManager'
import { startSessionManager, stopSessionManager, VISIBILITY_CHECK_DELAY } from './sessionManager'
import {
  SESSION_EXPIRATION_DELAY,
  SESSION_NOT_TRACKED,
  SESSION_TIME_OUT_DELAY,
  SessionPersistence,
} from './sessionConstants'
import type { SessionStoreStrategyType } from './storeStrategies/sessionStoreStrategy'
import { SESSION_STORE_KEY } from './storeStrategies/sessionStoreStrategy'
import { STORAGE_POLL_DELAY } from './sessionStore'

const enum FakeTrackingType {
  NOT_TRACKED = SESSION_NOT_TRACKED,
  TRACKED = 'tracked',
}

describe('startSessionManager', () => {
  const DURATION = 123456
  const FIRST_PRODUCT_KEY = 'first'
  const SECOND_PRODUCT_KEY = 'second'
  const STORE_TYPE: SessionStoreStrategyType = { type: SessionPersistence.COOKIE, cookieOptions: {} }
  let clock: Clock

  function expireSessionCookie() {
    expireCookie()
    clock.tick(STORAGE_POLL_DELAY)
  }

  function deleteSessionCookie() {
    setCookie(SESSION_STORE_KEY, '', DURATION)
    clock.tick(STORAGE_POLL_DELAY)
  }

  function expectSessionIdToBe(sessionManager: SessionManager<FakeTrackingType>, sessionId: string) {
    expect(sessionManager.findSession()!.id).toBe(sessionId)
    expect(getSessionState(SESSION_STORE_KEY).id).toBe(sessionId)
  }

  function expectSessionIdToBeDefined(sessionManager: SessionManager<FakeTrackingType>) {
    expect(sessionManager.findSession()!.id).toMatch(/^[a-f0-9-]+$/)
    expect(sessionManager.findSession()?.isExpired).toBeUndefined()

    expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/^[a-f0-9-]+$/)
    expect(getSessionState(SESSION_STORE_KEY).isExpired).toBeUndefined()
  }

  function expectSessionToBeExpired(sessionManager: SessionManager<FakeTrackingType>) {
    expect(sessionManager.findSession()).toBeUndefined()
    expect(getSessionState(SESSION_STORE_KEY).isExpired).toBe('1')
  }

  function expectSessionIdToNotBeDefined(sessionManager: SessionManager<FakeTrackingType>) {
    expect(sessionManager.findSession()!.id).toBeUndefined()
    expect(getSessionState(SESSION_STORE_KEY).id).toBeUndefined()
  }

  function expectTrackingTypeToBe(
    sessionManager: SessionManager<FakeTrackingType>,
    productKey: string,
    trackingType: FakeTrackingType
  ) {
    expect(sessionManager.findSession()!.trackingType).toEqual(trackingType)
    expect(getSessionState(SESSION_STORE_KEY)[productKey]).toEqual(trackingType)
  }

  function expectTrackingTypeToNotBeDefined(sessionManager: SessionManager<FakeTrackingType>, productKey: string) {
    expect(sessionManager.findSession()?.trackingType).toBeUndefined()
    expect(getSessionState(SESSION_STORE_KEY)[productKey]).toBeUndefined()
  }

  beforeEach(() => {
    clock = mockClock()

    registerCleanupTask(() => {
      // remove intervals first
      stopSessionManager()
      // flush pending callbacks to avoid random failures
      clock.tick(ONE_HOUR)
    })
  })

  describe('resume from a frozen tab ', () => {
    it('when session in store, do nothing', () => {
      setCookie(SESSION_STORE_KEY, 'id=abcdef&first=tracked', DURATION)
      const sessionManager = startSessionManagerWithDefaults()

      window.dispatchEvent(createNewEvent(DOM_EVENT.RESUME))

      expectSessionIdToBe(sessionManager, 'abcdef')
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.TRACKED)
    })

    it('when session not in store, reinitialize a session in store', () => {
      const sessionManager = startSessionManagerWithDefaults()

      deleteSessionCookie()

      expect(sessionManager.findSession()).toBeUndefined()
      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()

      window.dispatchEvent(createNewEvent(DOM_EVENT.RESUME))

      expectSessionToBeExpired(sessionManager)
    })
  })

  describe('cookie management', () => {
    it('when tracked, should store tracking type and session id', () => {
      const sessionManager = startSessionManagerWithDefaults()

      expectSessionIdToBeDefined(sessionManager)
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.TRACKED)
    })

    it('when not tracked should store tracking type', () => {
      const sessionManager = startSessionManagerWithDefaults({
        computeTrackingType: () => FakeTrackingType.NOT_TRACKED,
      })

      expectSessionIdToNotBeDefined(sessionManager)
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)
    })

    it('when tracked should keep existing tracking type and session id', () => {
      setCookie(SESSION_STORE_KEY, 'id=abcdef&first=tracked', DURATION)

      const sessionManager = startSessionManagerWithDefaults()

      expectSessionIdToBe(sessionManager, 'abcdef')
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.TRACKED)
    })

    it('when not tracked should keep existing tracking type', () => {
      setCookie(SESSION_STORE_KEY, `first=${SESSION_NOT_TRACKED}`, DURATION)

      const sessionManager = startSessionManagerWithDefaults({
        computeTrackingType: () => FakeTrackingType.NOT_TRACKED,
      })

      expectSessionIdToNotBeDefined(sessionManager)
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)
    })
  })

  describe('computeTrackingType', () => {
    let spy: (rawTrackingType?: string) => FakeTrackingType

    beforeEach(() => {
      spy = jasmine.createSpy().and.returnValue(FakeTrackingType.TRACKED)
    })

    it('should be called with an empty value if the cookie is not defined', () => {
      startSessionManagerWithDefaults({ computeTrackingType: spy })
      expect(spy).toHaveBeenCalledWith(undefined)
    })

    it('should be called with an invalid value if the cookie has an invalid value', () => {
      setCookie(SESSION_STORE_KEY, 'first=invalid', DURATION)
      startSessionManagerWithDefaults({ computeTrackingType: spy })
      expect(spy).toHaveBeenCalledWith('invalid')
    })

    it('should be called with TRACKED', () => {
      setCookie(SESSION_STORE_KEY, 'first=tracked', DURATION)
      startSessionManagerWithDefaults({ computeTrackingType: spy })
      expect(spy).toHaveBeenCalledWith(FakeTrackingType.TRACKED)
    })

    it('should be called with NOT_TRACKED', () => {
      setCookie(SESSION_STORE_KEY, `first=${SESSION_NOT_TRACKED}`, DURATION)
      startSessionManagerWithDefaults({ computeTrackingType: spy })
      expect(spy).toHaveBeenCalledWith(FakeTrackingType.NOT_TRACKED)
    })
  })

  describe('session renewal', () => {
    it('should renew on activity after expiration', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const renewSessionSpy = jasmine.createSpy()
      sessionManager.renewObservable.subscribe(renewSessionSpy)

      expireSessionCookie()

      expect(renewSessionSpy).not.toHaveBeenCalled()

      expectSessionToBeExpired(sessionManager)
      expectTrackingTypeToNotBeDefined(sessionManager, FIRST_PRODUCT_KEY)

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expect(renewSessionSpy).toHaveBeenCalled()
      expectSessionIdToBeDefined(sessionManager)
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.TRACKED)
    })

    it('should not renew on visibility after expiration', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const renewSessionSpy = jasmine.createSpy()
      sessionManager.renewObservable.subscribe(renewSessionSpy)

      expireSessionCookie()

      clock.tick(VISIBILITY_CHECK_DELAY)

      expect(renewSessionSpy).not.toHaveBeenCalled()
      expectSessionToBeExpired(sessionManager)
    })

    it('should not renew on activity if cookie is deleted by a 3rd party', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const renewSessionSpy = jasmine.createSpy('renewSessionSpy')
      sessionManager.renewObservable.subscribe(renewSessionSpy)

      deleteSessionCookie()

      expect(renewSessionSpy).not.toHaveBeenCalled()

      expect(sessionManager.findSession()).toBeUndefined()
      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expect(renewSessionSpy).not.toHaveBeenCalled()
      expect(sessionManager.findSession()).toBeUndefined()
      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()
    })
  })

  describe('multiple startSessionManager calls', () => {
    it('should re-use the same session id', () => {
      const firstSessionManager = startSessionManagerWithDefaults({ productKey: FIRST_PRODUCT_KEY })
      const idA = firstSessionManager.findSession()!.id

      const secondSessionManager = startSessionManagerWithDefaults({ productKey: SECOND_PRODUCT_KEY })
      const idB = secondSessionManager.findSession()!.id

      expect(idA).toBe(idB)
    })

    it('should not erase other session type', () => {
      startSessionManagerWithDefaults({ productKey: FIRST_PRODUCT_KEY })

      // schedule an expandOrRenewSession
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      clock.tick(STORAGE_POLL_DELAY / 2)

      // expand first session cookie cache
      document.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE))

      startSessionManagerWithDefaults({ productKey: SECOND_PRODUCT_KEY })

      // cookie correctly set
      expect(getSessionState(SESSION_STORE_KEY).first).toBeDefined()
      expect(getSessionState(SESSION_STORE_KEY).second).toBeDefined()

      clock.tick(STORAGE_POLL_DELAY / 2)

      // scheduled expandOrRenewSession should not use cached value
      expect(getSessionState(SESSION_STORE_KEY).first).toBeDefined()
      expect(getSessionState(SESSION_STORE_KEY).second).toBeDefined()
    })

    it('should have independent tracking types', () => {
      const firstSessionManager = startSessionManagerWithDefaults({
        productKey: FIRST_PRODUCT_KEY,
        computeTrackingType: () => FakeTrackingType.TRACKED,
      })
      const secondSessionManager = startSessionManagerWithDefaults({
        productKey: SECOND_PRODUCT_KEY,
        computeTrackingType: () => FakeTrackingType.NOT_TRACKED,
      })

      expect(firstSessionManager.findSession()!.trackingType).toEqual(FakeTrackingType.TRACKED)
      expect(secondSessionManager.findSession()!.trackingType).toEqual(FakeTrackingType.NOT_TRACKED)
    })

    it('should notify each expire and renew observables', () => {
      const firstSessionManager = startSessionManagerWithDefaults({ productKey: FIRST_PRODUCT_KEY })
      const expireSessionASpy = jasmine.createSpy()
      firstSessionManager.expireObservable.subscribe(expireSessionASpy)
      const renewSessionASpy = jasmine.createSpy()
      firstSessionManager.renewObservable.subscribe(renewSessionASpy)

      const secondSessionManager = startSessionManagerWithDefaults({ productKey: SECOND_PRODUCT_KEY })
      const expireSessionBSpy = jasmine.createSpy()
      secondSessionManager.expireObservable.subscribe(expireSessionBSpy)
      const renewSessionBSpy = jasmine.createSpy()
      secondSessionManager.renewObservable.subscribe(renewSessionBSpy)

      expireSessionCookie()

      expect(expireSessionASpy).toHaveBeenCalled()
      expect(expireSessionBSpy).toHaveBeenCalled()
      expect(renewSessionASpy).not.toHaveBeenCalled()
      expect(renewSessionBSpy).not.toHaveBeenCalled()

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expect(renewSessionASpy).toHaveBeenCalled()
      expect(renewSessionBSpy).toHaveBeenCalled()
    })
  })

  describe('session timeout', () => {
    it('should expire the session when the time out delay is reached', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expect(sessionManager.findSession()).toBeDefined()
      expect(getCookie(SESSION_STORE_KEY)).toBeDefined()

      clock.tick(SESSION_TIME_OUT_DELAY)
      expectSessionToBeExpired(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should renew an existing timed out session', () => {
      setCookie(SESSION_STORE_KEY, `id=abcde&first=tracked&created=${Date.now() - SESSION_TIME_OUT_DELAY}`, DURATION)

      const sessionManager = startSessionManagerWithDefaults()
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expect(sessionManager.findSession()!.id).not.toBe('abcde')
      expect(getSessionState(SESSION_STORE_KEY).created).toEqual(Date.now().toString())
      expect(expireSessionSpy).not.toHaveBeenCalled() // the session has not been active from the start
    })

    it('should not add created date to an existing session from an older versions', () => {
      setCookie(SESSION_STORE_KEY, 'id=abcde&first=tracked', DURATION)

      const sessionManager = startSessionManagerWithDefaults()

      expect(sessionManager.findSession()!.id).toBe('abcde')
      expect(getSessionState(SESSION_STORE_KEY).created).toBeUndefined()
    })
  })

  describe('automatic session expiration', () => {
    beforeEach(() => {
      setPageVisibility('hidden')
    })

    afterEach(() => {
      restorePageVisibility()
    })

    it('should expire the session after expiration delay', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expectSessionIdToBeDefined(sessionManager)

      clock.tick(SESSION_EXPIRATION_DELAY)
      expectSessionToBeExpired(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should expand duration on activity', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expectSessionIdToBeDefined(sessionManager)

      clock.tick(SESSION_EXPIRATION_DELAY - 10)
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      clock.tick(10)
      expectSessionIdToBeDefined(sessionManager)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(SESSION_EXPIRATION_DELAY)
      expectSessionToBeExpired(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should expand not tracked session duration on activity', () => {
      const sessionManager = startSessionManagerWithDefaults({
        computeTrackingType: () => FakeTrackingType.NOT_TRACKED,
      })
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)

      clock.tick(SESSION_EXPIRATION_DELAY - 10)
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      clock.tick(10)
      expectTrackingTypeToBe(sessionManager, FIRST_PRODUCT_KEY, FakeTrackingType.NOT_TRACKED)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(SESSION_EXPIRATION_DELAY)
      expectTrackingTypeToNotBeDefined(sessionManager, FIRST_PRODUCT_KEY)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should expand session on visibility', () => {
      setPageVisibility('visible')

      const sessionManager = startSessionManagerWithDefaults()
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
      expectSessionToBeExpired(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should expand not tracked session on visibility', () => {
      setPageVisibility('visible')

      const sessionManager = startSessionManagerWithDefaults({
        computeTrackingType: () => FakeTrackingType.NOT_TRACKED,
      })
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

  describe('manual session expiration', () => {
    it('expires the session when calling expire()', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      sessionManager.expire()

      expectSessionToBeExpired(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('notifies expired session only once when calling expire() multiple times', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      sessionManager.expire()
      sessionManager.expire()

      expectSessionToBeExpired(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalledTimes(1)
    })

    it('notifies expired session only once when calling expire() after the session has been expired', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      clock.tick(SESSION_EXPIRATION_DELAY)
      sessionManager.expire()

      expectSessionToBeExpired(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalledTimes(1)
    })

    it('renew the session on user activity', () => {
      const sessionManager = startSessionManagerWithDefaults()
      clock.tick(STORAGE_POLL_DELAY)

      sessionManager.expire()

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expectSessionIdToBeDefined(sessionManager)
    })
  })

  describe('session history', () => {
    it('should return undefined when there is no current session and no startTime', () => {
      const sessionManager = startSessionManagerWithDefaults()
      expireSessionCookie()

      expect(sessionManager.findSession()).toBeUndefined()
    })

    it('should return the current session context when there is no start time', () => {
      const sessionManager = startSessionManagerWithDefaults()

      expect(sessionManager.findSession()!.id).toBeDefined()
      expect(sessionManager.findSession()!.trackingType).toBeDefined()
    })

    it('should return the session context corresponding to startTime', () => {
      const sessionManager = startSessionManagerWithDefaults()

      // 0s to 10s: first session
      clock.tick(10 * ONE_SECOND - STORAGE_POLL_DELAY)
      const firstSessionId = sessionManager.findSession()!.id
      const firstSessionTrackingType = sessionManager.findSession()!.trackingType
      expireSessionCookie()

      // 10s to 20s: no session
      clock.tick(10 * ONE_SECOND)

      // 20s to end: second session
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      clock.tick(10 * ONE_SECOND)
      const secondSessionId = sessionManager.findSession()!.id
      const secondSessionTrackingType = sessionManager.findSession()!.trackingType

      expect(sessionManager.findSession(clock.relative(5 * ONE_SECOND))!.id).toBe(firstSessionId)
      expect(sessionManager.findSession(clock.relative(5 * ONE_SECOND))!.trackingType).toBe(firstSessionTrackingType)
      expect(sessionManager.findSession(clock.relative(15 * ONE_SECOND))).toBeUndefined()
      expect(sessionManager.findSession(clock.relative(25 * ONE_SECOND))!.id).toBe(secondSessionId)
      expect(sessionManager.findSession(clock.relative(25 * ONE_SECOND))!.trackingType).toBe(secondSessionTrackingType)
    })

    describe('option `returnInactive` is true', () => {
      it('should return the session context even when the session is expired', () => {
        const sessionManager = startSessionManagerWithDefaults()

        // 0s to 10s: first session
        clock.tick(10 * ONE_SECOND - STORAGE_POLL_DELAY)

        expireSessionCookie()

        // 10s to 20s: no session
        clock.tick(10 * ONE_SECOND)

        expect(sessionManager.findSession(clock.relative(15 * ONE_SECOND), { returnInactive: true })).toBeDefined()

        expect(sessionManager.findSession(clock.relative(15 * ONE_SECOND), { returnInactive: false })).toBeUndefined()
      })
    })

    it('should return the current session context in the renewObservable callback', () => {
      const sessionManager = startSessionManagerWithDefaults()
      let currentSession
      sessionManager.renewObservable.subscribe(() => (currentSession = sessionManager.findSession()))

      // new session
      expireSessionCookie()
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      clock.tick(STORAGE_POLL_DELAY)

      expect(currentSession).toBeDefined()
    })

    it('should return the current session context in the expireObservable callback', () => {
      const sessionManager = startSessionManagerWithDefaults()
      let currentSession
      sessionManager.expireObservable.subscribe(() => (currentSession = sessionManager.findSession()))

      // new session
      expireSessionCookie()
      clock.tick(STORAGE_POLL_DELAY)

      expect(currentSession).toBeDefined()
    })
  })

  describe('tracking consent', () => {
    it('expires the session when tracking consent is withdrawn', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      const sessionManager = startSessionManagerWithDefaults({ trackingConsentState })

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)

      expectSessionToBeExpired(sessionManager)
      expect(getSessionState(SESSION_STORE_KEY).isExpired).toBe('1')
    })

    it('does not renew the session when tracking consent is withdrawn', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      const sessionManager = startSessionManagerWithDefaults({ trackingConsentState })

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expectSessionToBeExpired(sessionManager)
    })

    it('renews the session when tracking consent is granted', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      const sessionManager = startSessionManagerWithDefaults({ trackingConsentState })
      const initialSessionId = sessionManager.findSession()!.id

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)

      expectSessionToBeExpired(sessionManager)

      trackingConsentState.update(TrackingConsent.GRANTED)

      clock.tick(STORAGE_POLL_DELAY)

      expectSessionIdToBeDefined(sessionManager)
      expect(sessionManager.findSession()!.id).not.toBe(initialSessionId)
    })
  })

  describe('session state update', () => {
    it('should notify session manager update observable', () => {
      const sessionStateUpdateSpy = jasmine.createSpy()
      const sessionManager = startSessionManagerWithDefaults()
      sessionManager.sessionStateUpdateObservable.subscribe(sessionStateUpdateSpy)

      sessionManager.updateSessionState({ extra: 'extra' })

      expectSessionIdToBeDefined(sessionManager)
      expect(sessionStateUpdateSpy).toHaveBeenCalledTimes(1)

      const callArgs = sessionStateUpdateSpy.calls.argsFor(0)[0]
      expect(callArgs.previousState.extra).toBeUndefined()
      expect(callArgs.newState.extra).toBe('extra')
    })
  })

  function startSessionManagerWithDefaults({
    configuration,
    productKey = FIRST_PRODUCT_KEY,
    computeTrackingType = () => FakeTrackingType.TRACKED,
    trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED),
  }: {
    configuration?: Partial<Configuration>
    productKey?: string
    computeTrackingType?: () => FakeTrackingType
    trackingConsentState?: TrackingConsentState
  } = {}) {
    return startSessionManager(
      {
        sessionStoreStrategyType: STORE_TYPE,
        ...configuration,
      } as Configuration,
      productKey,
      computeTrackingType,
      trackingConsentState
    )
  }
})

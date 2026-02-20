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
import { display } from '../../tools/display'
import { ONE_HOUR, ONE_SECOND } from '../../tools/utils/timeUtils'
import type { Configuration } from '../configuration'
import type { TrackingConsentState } from '../trackingConsent'
import { TrackingConsent, createTrackingConsentState } from '../trackingConsent'
import { isChromium } from '../../tools/utils/browserDetection'
import type { SessionManager } from './sessionManager'
import { startSessionManager, stopSessionManager, VISIBILITY_CHECK_DELAY } from './sessionManager'
import { SESSION_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY, SessionPersistence } from './sessionConstants'
import type { SessionStoreStrategyType } from './storeStrategies/sessionStoreStrategy'
import { SESSION_STORE_KEY } from './storeStrategies/sessionStoreStrategy'
import { STORAGE_POLL_DELAY } from './sessionStore'
import { createLock, LOCK_RETRY_DELAY } from './sessionStoreOperations'

describe('startSessionManager', () => {
  const DURATION = 123456
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

  function expectSessionIdToBe(sessionManager: SessionManager, sessionId: string) {
    expect(sessionManager.findSession()!.id).toBe(sessionId)
    expect(getSessionState(SESSION_STORE_KEY).id).toBe(sessionId)
  }

  function expectSessionIdToBeDefined(sessionManager: SessionManager) {
    expect(sessionManager.findSession()!.id).toMatch(/^[a-f0-9-]+$/)

    expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/^[a-f0-9-]+$/)
    expect(getSessionState(SESSION_STORE_KEY).isExpired).toBeUndefined()
  }

  function expectSessionToBeExpired(sessionManager: SessionManager) {
    expect(sessionManager.findSession()).toBeUndefined()
    expect(getSessionState(SESSION_STORE_KEY).isExpired).toBe('1')
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

  describe('initialization', () => {
    it('should not start if no session store available', () => {
      const displayWarnSpy = spyOn(display, 'warn')
      const onReadySpy = jasmine.createSpy('onReady')

      startSessionManager(
        { sessionStoreStrategyType: undefined } as Configuration,
        createTrackingConsentState(TrackingConsent.GRANTED),
        onReadySpy
      )

      expect(displayWarnSpy).toHaveBeenCalledWith('No storage available for session. We will not send any data.')
      expect(onReadySpy).not.toHaveBeenCalled()
    })
  })

  describe('resume from a frozen tab ', () => {
    it('when session in store, do nothing', async () => {
      setCookie(SESSION_STORE_KEY, 'id=abcdef', DURATION)
      const sessionManager = await startSessionManagerWithDefaults()

      window.dispatchEvent(createNewEvent(DOM_EVENT.RESUME))

      expectSessionIdToBe(sessionManager, 'abcdef')
    })

    it('when session not in store, reinitialize a session in store', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      deleteSessionCookie()

      expect(sessionManager.findSession()).toBeUndefined()
      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()

      window.dispatchEvent(createNewEvent(DOM_EVENT.RESUME))

      expectSessionToBeExpired(sessionManager)
    })
  })

  describe('cookie management', () => {
    it('should store session id', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      expectSessionIdToBeDefined(sessionManager)
    })

    it('should keep existing session id', async () => {
      setCookie(SESSION_STORE_KEY, 'id=abcdef', DURATION)

      const sessionManager = await startSessionManagerWithDefaults()

      expectSessionIdToBe(sessionManager, 'abcdef')
    })
  })

  describe('session renewal', () => {
    it('should renew on activity after expiration', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const renewSessionSpy = jasmine.createSpy()
      sessionManager.renewObservable.subscribe(renewSessionSpy)

      expireSessionCookie()

      expect(renewSessionSpy).not.toHaveBeenCalled()

      expectSessionToBeExpired(sessionManager)

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expect(renewSessionSpy).toHaveBeenCalled()
      expectSessionIdToBeDefined(sessionManager)
    })

    it('should not renew on visibility after expiration', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const renewSessionSpy = jasmine.createSpy()
      sessionManager.renewObservable.subscribe(renewSessionSpy)

      expireSessionCookie()

      clock.tick(VISIBILITY_CHECK_DELAY)

      expect(renewSessionSpy).not.toHaveBeenCalled()
      expectSessionToBeExpired(sessionManager)
    })

    it('should not renew on activity if cookie is deleted by a 3rd party', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
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
    it('should re-use the same session id', async () => {
      const [firstSessionManager, secondSessionManager] = await Promise.all([
        startSessionManagerWithDefaults(),
        startSessionManagerWithDefaults(),
      ])

      const idA = firstSessionManager.findSession()!.id
      const idB = secondSessionManager.findSession()!.id

      expect(idA).toBe(idB)
    })

    it('should notify each expire and renew observables', async () => {
      const [firstSessionManager, secondSessionManager] = await Promise.all([
        startSessionManagerWithDefaults(),
        startSessionManagerWithDefaults(),
      ])

      const expireSessionASpy = jasmine.createSpy()
      firstSessionManager.expireObservable.subscribe(expireSessionASpy)
      const renewSessionASpy = jasmine.createSpy()
      firstSessionManager.renewObservable.subscribe(renewSessionASpy)

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
    it('should expire the session when the time out delay is reached', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expect(sessionManager.findSession()).toBeDefined()
      expect(getCookie(SESSION_STORE_KEY)).toBeDefined()

      clock.tick(SESSION_TIME_OUT_DELAY)
      expectSessionToBeExpired(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should renew an existing timed out session', async () => {
      setCookie(SESSION_STORE_KEY, `id=abcde&created=${Date.now() - SESSION_TIME_OUT_DELAY}`, DURATION)

      const sessionManager = await startSessionManagerWithDefaults()
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expect(sessionManager.findSession()!.id).not.toBe('abcde')
      expect(getSessionState(SESSION_STORE_KEY).created).toEqual(Date.now().toString())
      expect(expireSessionSpy).not.toHaveBeenCalled() // the session has not been active from the start
    })

    it('should not add created date to an existing session from an older versions', async () => {
      setCookie(SESSION_STORE_KEY, 'id=abcde', DURATION)

      const sessionManager = await startSessionManagerWithDefaults()

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

    it('should expire the session after expiration delay', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      expectSessionIdToBeDefined(sessionManager)

      clock.tick(SESSION_EXPIRATION_DELAY)
      expectSessionToBeExpired(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should expand duration on activity', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
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

    it('should expand session on visibility', async () => {
      setPageVisibility('visible')

      const sessionManager = await startSessionManagerWithDefaults()
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
  })

  describe('manual session expiration', () => {
    it('expires the session when calling expire()', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      sessionManager.expire()

      expectSessionToBeExpired(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('notifies expired session only once when calling expire() multiple times', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      sessionManager.expire()
      sessionManager.expire()

      expectSessionToBeExpired(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalledTimes(1)
    })

    it('notifies expired session only once when calling expire() after the session has been expired', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      clock.tick(SESSION_EXPIRATION_DELAY)
      sessionManager.expire()

      expectSessionToBeExpired(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalledTimes(1)
    })

    it('renew the session on user activity', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      clock.tick(STORAGE_POLL_DELAY)

      sessionManager.expire()

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expectSessionIdToBeDefined(sessionManager)
    })
  })

  describe('session history', () => {
    it('should return undefined when there is no current session and no startTime', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      expireSessionCookie()

      expect(sessionManager.findSession()).toBeUndefined()
    })

    it('should return the current session context when there is no start time', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      expect(sessionManager.findSession()!.id).toBeDefined()
    })

    it('should return the session context corresponding to startTime', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      // 0s to 10s: first session
      clock.tick(10 * ONE_SECOND - STORAGE_POLL_DELAY)
      const firstSessionId = sessionManager.findSession()!.id
      expireSessionCookie()

      // 10s to 20s: no session
      clock.tick(10 * ONE_SECOND)

      // 20s to end: second session
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      clock.tick(10 * ONE_SECOND)
      const secondSessionId = sessionManager.findSession()!.id

      expect(sessionManager.findSession(clock.relative(5 * ONE_SECOND))!.id).toBe(firstSessionId)
      expect(sessionManager.findSession(clock.relative(15 * ONE_SECOND))).toBeUndefined()
      expect(sessionManager.findSession(clock.relative(25 * ONE_SECOND))!.id).toBe(secondSessionId)
    })

    describe('option `returnInactive` is true', () => {
      it('should return the session context even when the session is expired', async () => {
        const sessionManager = await startSessionManagerWithDefaults()

        // 0s to 10s: first session
        clock.tick(10 * ONE_SECOND - STORAGE_POLL_DELAY)

        expireSessionCookie()

        // 10s to 20s: no session
        clock.tick(10 * ONE_SECOND)

        expect(sessionManager.findSession(clock.relative(15 * ONE_SECOND), { returnInactive: true })).toBeDefined()

        expect(sessionManager.findSession(clock.relative(15 * ONE_SECOND), { returnInactive: false })).toBeUndefined()
      })
    })

    it('should return the current session context in the renewObservable callback', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      let currentSession
      sessionManager.renewObservable.subscribe(() => (currentSession = sessionManager.findSession()))

      // new session
      expireSessionCookie()
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      clock.tick(STORAGE_POLL_DELAY)

      expect(currentSession).toBeDefined()
    })

    it('should return the current session context in the expireObservable callback', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      let currentSession
      sessionManager.expireObservable.subscribe(() => (currentSession = sessionManager.findSession()))

      // new session
      expireSessionCookie()
      clock.tick(STORAGE_POLL_DELAY)

      expect(currentSession).toBeDefined()
    })
  })

  describe('tracking consent', () => {
    it('expires the session when tracking consent is withdrawn', async () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      const sessionManager = await startSessionManagerWithDefaults({ trackingConsentState })

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)

      expectSessionToBeExpired(sessionManager)
      expect(getSessionState(SESSION_STORE_KEY).isExpired).toBe('1')
    })

    it('does not renew the session when tracking consent is withdrawn', async () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      const sessionManager = await startSessionManagerWithDefaults({ trackingConsentState })

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expectSessionToBeExpired(sessionManager)
    })

    it('expires the session when tracking consent is withdrawn during async initialization', () => {
      if (!isChromium()) {
        pending('the lock is only enabled in Chromium')
      }

      // Set up a locked cookie to delay initialization
      setCookie(SESSION_STORE_KEY, `lock=${createLock()}`, DURATION)

      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      void startSessionManagerWithDefaults({ trackingConsentState })

      // Consent is revoked while waiting for lock
      trackingConsentState.update(TrackingConsent.NOT_GRANTED)

      // Release the lock
      setCookie(SESSION_STORE_KEY, 'id=abc123&first=tracked', DURATION)
      clock.tick(LOCK_RETRY_DELAY)

      // Session should be expired due to consent revocation
      expect(getSessionState(SESSION_STORE_KEY).isExpired).toBe('1')
    })

    it('renews the session when tracking consent is granted', async () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      const sessionManager = await startSessionManagerWithDefaults({ trackingConsentState })
      const initialSessionId = sessionManager.findSession()!.id

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)

      expectSessionToBeExpired(sessionManager)

      trackingConsentState.update(TrackingConsent.GRANTED)

      clock.tick(STORAGE_POLL_DELAY)

      expectSessionIdToBeDefined(sessionManager)
      expect(sessionManager.findSession()!.id).not.toBe(initialSessionId)
    })

    it('Remove anonymousId when tracking consent is withdrawn', async () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      const sessionManager = await startSessionManagerWithDefaults({ trackingConsentState })
      const session = sessionManager.findSession()!

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)

      expect(session.anonymousId).toBeUndefined()
    })
  })

  describe('session state update', () => {
    it('should notify session manager update observable', async () => {
      const sessionStateUpdateSpy = jasmine.createSpy()
      const sessionManager = await startSessionManagerWithDefaults()
      sessionManager.sessionStateUpdateObservable.subscribe(sessionStateUpdateSpy)

      sessionManager.updateSessionState({ extra: 'extra' })

      expectSessionIdToBeDefined(sessionManager)
      expect(sessionStateUpdateSpy).toHaveBeenCalledTimes(1)

      const callArgs = sessionStateUpdateSpy.calls.argsFor(0)[0]
      expect(callArgs.previousState.extra).toBeUndefined()
      expect(callArgs.newState.extra).toBe('extra')
    })
  })

  describe('delayed session manager initialization', () => {
    it('starts the session manager synchronously if the session cookie is not locked', () => {
      void startSessionManagerWithDefaults()
      expect(getSessionState(SESSION_STORE_KEY).id).toBeDefined()
      // Tracking type is no longer stored in cookies - computed on demand
    })

    it('delays the session manager initialization if the session cookie is locked', () => {
      if (!isChromium()) {
        pending('the lock is only enabled in Chromium')
      }
      setCookie(SESSION_STORE_KEY, `lock=${createLock()}`, DURATION)
      void startSessionManagerWithDefaults()
      expect(getSessionState(SESSION_STORE_KEY).id).toBeUndefined()

      // Remove the lock
      setCookie(SESSION_STORE_KEY, 'id=abcde', DURATION)
      clock.tick(LOCK_RETRY_DELAY)

      expect(getSessionState(SESSION_STORE_KEY).id).toBe('abcde')
      // Tracking type is no longer stored in cookies - computed on demand
    })

    it('should call onReady callback with session manager after lock is released', () => {
      if (!isChromium()) {
        pending('the lock is only enabled in Chromium')
      }

      setCookie(SESSION_STORE_KEY, `lock=${createLock()}`, DURATION)
      const onReadySpy = jasmine.createSpy<(sessionManager: SessionManager) => void>('onReady')

      startSessionManager(
        { sessionStoreStrategyType: STORE_TYPE } as Configuration,
        createTrackingConsentState(TrackingConsent.GRANTED),
        onReadySpy
      )

      expect(onReadySpy).not.toHaveBeenCalled()

      // Remove lock
      setCookie(SESSION_STORE_KEY, 'id=abc123', DURATION)
      clock.tick(LOCK_RETRY_DELAY)

      expect(onReadySpy).toHaveBeenCalledTimes(1)
      expect(onReadySpy.calls.mostRecent().args[0].findSession).toBeDefined()
    })
  })

  function startSessionManagerWithDefaults({
    configuration,
    trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED),
  }: {
    configuration?: Partial<Configuration>
    trackingConsentState?: TrackingConsentState
  } = {}) {
    return new Promise<SessionManager>((resolve) => {
      startSessionManager(
        {
          sessionStoreStrategyType: STORE_TYPE,
          ...configuration,
        } as Configuration,
        trackingConsentState,
        resolve
      )
    })
  }
})

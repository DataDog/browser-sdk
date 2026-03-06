import {
  createNewEvent,
  expireCookie,
  getSessionState,
  HIGH_HASH_UUID,
  LOW_HASH_UUID,
  mockClock,
  registerCleanupTask,
  replaceMockable,
  restorePageVisibility,
  setPageVisibility,
} from '../../../test'
import type { Clock } from '../../../test'
import { getCookie, setCookie } from '../../browser/cookie'
import { DOM_EVENT } from '../../browser/addEventListener'
import { display } from '../../tools/display'
import { ONE_HOUR, ONE_SECOND, relativeNow } from '../../tools/utils/timeUtils'
import type { Configuration } from '../configuration'
import type { TrackingConsentState } from '../trackingConsent'
import { TrackingConsent, createTrackingConsentState } from '../trackingConsent'
import { withNativeSessionLock } from './sessionLock'
import type { SessionManager } from './sessionManager'
import {
  startSessionManager,
  startSessionManagerStub,
  stopSessionManager,
  VISIBILITY_CHECK_DELAY,
} from './sessionManager'
import { SESSION_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY, SessionPersistence } from './sessionConstants'
import type { SessionStoreStrategyType } from './storeStrategies/sessionStoreStrategy'
import { SESSION_STORE_KEY } from './storeStrategies/sessionStoreStrategy'
import { STORAGE_POLL_DELAY } from './sessionStore'

let lockQueue: Promise<void>

function mockLock() {
  lockQueue = Promise.resolve()
  replaceMockable(withNativeSessionLock, (fn: () => void | Promise<void>) => {
    lockQueue = lockQueue.then(fn, fn)
  })
}

async function flushLock() {
  await lockQueue
}

// Force the document.cookie fallback path in tests.
// This ensures that onExternalChange uses polling (triggered by clock.tick) rather than
// CookieStore change events, and that all cookie operations are synchronous under the hood.
let originalCookieStoreDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  originalCookieStoreDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'cookieStore')
  Object.defineProperty(globalThis, 'cookieStore', { value: undefined, configurable: true, writable: true })
})

afterEach(() => {
  if (originalCookieStoreDescriptor) {
    Object.defineProperty(globalThis, 'cookieStore', originalCookieStoreDescriptor)
  } else {
    delete (globalThis as any).cookieStore
  }
})

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
    mockLock()
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
      await flushLock()

      expectSessionIdToBe(sessionManager, 'abcdef')
    })

    it('when session not in store, reinitialize a session in store', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      deleteSessionCookie()
      await flushLock()

      expect(sessionManager.findSession()).toBeUndefined()
      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()

      window.dispatchEvent(createNewEvent(DOM_EVENT.RESUME))
      await flushLock()

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
      await flushLock()

      expect(renewSessionSpy).not.toHaveBeenCalled()

      expectSessionToBeExpired(sessionManager)

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      await flushLock()

      expect(renewSessionSpy).toHaveBeenCalled()
      expectSessionIdToBeDefined(sessionManager)
    })

    it('should not renew on visibility after expiration', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const renewSessionSpy = jasmine.createSpy()
      sessionManager.renewObservable.subscribe(renewSessionSpy)

      expireSessionCookie()
      await flushLock()

      clock.tick(VISIBILITY_CHECK_DELAY)
      await flushLock()

      expect(renewSessionSpy).not.toHaveBeenCalled()
      expectSessionToBeExpired(sessionManager)
    })

    it('should not renew on activity if cookie is deleted by a 3rd party', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const renewSessionSpy = jasmine.createSpy('renewSessionSpy')
      sessionManager.renewObservable.subscribe(renewSessionSpy)

      deleteSessionCookie()
      await flushLock()

      expect(renewSessionSpy).not.toHaveBeenCalled()

      expect(sessionManager.findSession()).toBeUndefined()
      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      await flushLock()

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
      await flushLock()

      expect(expireSessionASpy).toHaveBeenCalled()
      expect(expireSessionBSpy).toHaveBeenCalled()
      expect(renewSessionASpy).not.toHaveBeenCalled()
      expect(renewSessionBSpy).not.toHaveBeenCalled()

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      await flushLock()

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
      await flushLock()
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
      await flushLock()
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
      await flushLock()

      clock.tick(10)
      await flushLock()
      expectSessionIdToBeDefined(sessionManager)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(SESSION_EXPIRATION_DELAY)
      await flushLock()
      expectSessionToBeExpired(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('should expand session on visibility', async () => {
      setPageVisibility('visible')

      const sessionManager = await startSessionManagerWithDefaults()
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      clock.tick(3 * VISIBILITY_CHECK_DELAY)
      await flushLock()
      setPageVisibility('hidden')
      expectSessionIdToBeDefined(sessionManager)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(SESSION_EXPIRATION_DELAY - 10)
      await flushLock()
      expectSessionIdToBeDefined(sessionManager)
      expect(expireSessionSpy).not.toHaveBeenCalled()

      clock.tick(10)
      await flushLock()
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
      await flushLock()

      expectSessionToBeExpired(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalled()
    })

    it('notifies expired session only once when calling expire() multiple times', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      sessionManager.expire()
      await flushLock()
      sessionManager.expire()
      await flushLock()

      expectSessionToBeExpired(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalledTimes(1)
    })

    it('notifies expired session only once when calling expire() after the session has been expired', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const expireSessionSpy = jasmine.createSpy()
      sessionManager.expireObservable.subscribe(expireSessionSpy)

      clock.tick(SESSION_EXPIRATION_DELAY)
      await flushLock()
      sessionManager.expire()
      await flushLock()

      expectSessionToBeExpired(sessionManager)
      expect(expireSessionSpy).toHaveBeenCalledTimes(1)
    })

    it('renew the session on user activity', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      clock.tick(STORAGE_POLL_DELAY)
      await flushLock()

      sessionManager.expire()
      await flushLock()

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      await flushLock()

      expectSessionIdToBeDefined(sessionManager)
    })
  })

  describe('session history', () => {
    it('should return undefined when there is no current session and no startTime', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      expireSessionCookie()
      await flushLock()

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
      expireSessionCookie()
      await flushLock()

      // 10s to 20s: no session
      clock.tick(10 * ONE_SECOND)
      await flushLock()

      const firstSessionId = sessionManager.findSession(clock.relative(5 * ONE_SECOND))!.id

      // 20s to end: second session
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      await flushLock()
      clock.tick(10 * ONE_SECOND)
      await flushLock()
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
        await flushLock()

        // 10s to 20s: no session
        clock.tick(10 * ONE_SECOND)
        await flushLock()

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
      await flushLock()
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      await flushLock()
      clock.tick(STORAGE_POLL_DELAY)
      await flushLock()

      expect(currentSession).toBeDefined()
    })

    it('should return the current session context in the expireObservable callback', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      let currentSession
      sessionManager.expireObservable.subscribe(() => (currentSession = sessionManager.findSession()))

      // new session
      expireSessionCookie()
      await flushLock()
      clock.tick(STORAGE_POLL_DELAY)
      await flushLock()

      expect(currentSession).toBeDefined()
    })
  })

  describe('tracking consent', () => {
    it('expires the session when tracking consent is withdrawn', async () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      const sessionManager = await startSessionManagerWithDefaults({ trackingConsentState })

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)
      await flushLock()

      expectSessionToBeExpired(sessionManager)
      expect(getSessionState(SESSION_STORE_KEY).isExpired).toBe('1')
    })

    it('does not renew the session when tracking consent is withdrawn', async () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      const sessionManager = await startSessionManagerWithDefaults({ trackingConsentState })

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)
      await flushLock()

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      await flushLock()

      expectSessionToBeExpired(sessionManager)
    })

    it('renews the session when tracking consent is granted', async () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      const sessionManager = await startSessionManagerWithDefaults({ trackingConsentState })
      const initialSessionId = sessionManager.findSession()!.id

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)
      await flushLock()

      expectSessionToBeExpired(sessionManager)

      trackingConsentState.update(TrackingConsent.GRANTED)
      await flushLock()

      clock.tick(STORAGE_POLL_DELAY)
      await flushLock()

      expectSessionIdToBeDefined(sessionManager)
      expect(sessionManager.findSession()!.id).not.toBe(initialSessionId)
    })

    it('Remove anonymousId when tracking consent is withdrawn', async () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      const sessionManager = await startSessionManagerWithDefaults({ trackingConsentState })
      const session = sessionManager.findSession()!

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)
      await flushLock()

      expect(session.anonymousId).toBeUndefined()
    })
  })

  describe('session state update', () => {
    it('should notify session manager update observable', async () => {
      const sessionStateUpdateSpy = jasmine.createSpy()
      const sessionManager = await startSessionManagerWithDefaults()
      sessionManager.sessionStateUpdateObservable.subscribe(sessionStateUpdateSpy)

      sessionManager.updateSessionState({ extra: 'extra' })
      await flushLock()

      expectSessionIdToBeDefined(sessionManager)
      expect(sessionStateUpdateSpy).toHaveBeenCalledTimes(1)

      const callArgs = sessionStateUpdateSpy.calls.argsFor(0)[0]
      expect(callArgs.previousState.extra).toBeUndefined()
      expect(callArgs.newState.extra).toBe('extra')
    })

    it('should rebuild session context when state is updated', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      expect(sessionManager.findSession()!.isReplayForced).toBe(false)

      sessionManager.updateSessionState({ forcedReplay: '1' })
      await flushLock()

      expect(sessionManager.findSession()!.isReplayForced).toBe(true)
    })
  })

  describe('findTrackedSession', () => {
    it('should return undefined when session is not sampled', async () => {
      const sessionManager = await startSessionManagerWithDefaults({ configuration: { sessionSampleRate: 0 } })

      expect(sessionManager.findTrackedSession()).toBeUndefined()
    })

    it('should return the session when sampled', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      const session = sessionManager.findTrackedSession()
      expect(session).toBeDefined()
      expect(session!.id).toBeDefined()
    })

    it('should pass through startTime and options', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      // 0s to 10s: first session
      clock.tick(10 * ONE_SECOND - STORAGE_POLL_DELAY)
      expireSessionCookie()
      await flushLock()

      // 10s to 20s: no session
      clock.tick(10 * ONE_SECOND)
      await flushLock()

      expect(sessionManager.findTrackedSession(clock.relative(5 * ONE_SECOND))).toBeDefined()
      expect(sessionManager.findTrackedSession(clock.relative(15 * ONE_SECOND))).toBeUndefined()
    })

    it('should return isReplayForced from the session context', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      expect(sessionManager.findTrackedSession()!.isReplayForced).toBe(false)

      sessionManager.updateSessionState({ forcedReplay: '1' })
      await flushLock()

      expect(sessionManager.findTrackedSession()!.isReplayForced).toBe(true)
    })

    it('should return the session if it has expired when returnInactive = true', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      expireCookie()
      clock.tick(STORAGE_POLL_DELAY)
      await flushLock()
      expect(sessionManager.findTrackedSession(relativeNow(), { returnInactive: true })).toBeDefined()
    })

    describe('deterministic sampling', () => {
      beforeEach(() => {
        if (!window.BigInt) {
          pending('BigInt is not supported')
        }
      })

      it('should track a session whose ID has a low hash, even with a low sessionSampleRate', async () => {
        setCookie(SESSION_STORE_KEY, `id=${LOW_HASH_UUID}`, DURATION)
        const sessionManager = await startSessionManagerWithDefaults({ configuration: { sessionSampleRate: 1 } })
        expect(sessionManager.findTrackedSession()).toBeDefined()
      })

      it('should not track a session whose ID has a high hash, even with a high sessionSampleRate', async () => {
        setCookie(SESSION_STORE_KEY, `id=${HIGH_HASH_UUID}`, DURATION)
        const sessionManager = await startSessionManagerWithDefaults({ configuration: { sessionSampleRate: 99 } })
        expect(sessionManager.findTrackedSession()).toBeUndefined()
      })
    })
  })

  describe('delayed session manager initialization', () => {
    it('starts the session manager synchronously if the session cookie is not locked', async () => {
      await startSessionManagerWithDefaults()
      expect(getSessionState(SESSION_STORE_KEY).id).toBeDefined()
      // Tracking type is no longer stored in cookies - computed on demand
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
          sessionSampleRate: 100,
          ...configuration,
        } as Configuration,
        trackingConsentState,
        resolve
      )
    })
  }
})

describe('startSessionManagerStub', () => {
  it('should always return a tracked session', () => {
    let sessionManager: SessionManager | undefined
    startSessionManagerStub((sm) => {
      sessionManager = sm
    })
    expect(sessionManager!.findTrackedSession()).toBeDefined()
    expect(sessionManager!.findTrackedSession()!.id).toBeDefined()
  })
})

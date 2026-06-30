import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import { ONE_SECOND } from '@datadog/js-core/time'
import {
  collectAsyncCalls,
  createFakeSessionStoreStrategy,
  createNewEvent,
  HIGH_HASH_UUID,
  LOW_HASH_UUID,
  mockClock,
  registerCleanupTask,
  replaceMockable,
  restorePageVisibility,
  setPageVisibility,
  waitNextMicrotask,
} from '../../../test'
import type { Clock } from '../../../test'
import { DOM_EVENT } from '../../browser/addEventListener'
import { display } from '../../tools/display'
import type { Configuration } from '../configuration'
import type { TrackingConsentState } from '../trackingConsent'
import { TrackingConsent, createTrackingConsentState } from '../trackingConsent'
import type { SessionManager } from './sessionManager'
import {
  startSessionManager,
  startSessionManagerStub,
  stopSessionManager,
  TRACKED_SESSION_MAX_AGE,
  VISIBILITY_CHECK_DELAY,
} from './sessionManager'
import { getSessionStoreStrategy, selectSessionStoreStrategyType } from './sessionStore'
import { SESSION_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY, SessionPersistence } from './sessionConstants'
import type { SessionStoreStrategyType } from './storeStrategies/sessionStoreStrategy'
import { CookieApi } from './storeStrategies/sessionStoreStrategy'
import type { SessionState } from './sessionState'
import { EXPIRED } from './sessionState'

// Flush several microtask cycles so chained awaits inside startSessionManager
// (resolveInitialState's await, the .catch chain, and the post-await continuation)
// have a chance to run before assertions.
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve()
  }
}

describe('startSessionManager', () => {
  const STORE_TYPE: SessionStoreStrategyType = {
    type: SessionPersistence.COOKIE,
    cookieOptions: {},
    cookieApi: CookieApi.DOCUMENT_COOKIE,
  }
  let fakeStrategy: ReturnType<typeof createFakeSessionStoreStrategy>
  let clock: Clock
  let sessionObservableSpy: Mock<(...args: any[]) => any>

  /**
   * Creates a fresh fake strategy and updates the mockable reference.
   * Since `replaceMockable` can only be called once per test, we use a mutable
   * container that always returns the current `fakeStrategy`.
   */
  function setupFakeStrategy(options?: Parameters<typeof createFakeSessionStoreStrategy>[0]) {
    fakeStrategy = createFakeSessionStoreStrategy(options)
  }

  let currentStoreType: SessionStoreStrategyType | undefined

  beforeEach(() => {
    sessionObservableSpy = vi.fn()
    clock = mockClock()
    fakeStrategy = createFakeSessionStoreStrategy()
    fakeStrategy.sessionObservable.subscribe(sessionObservableSpy)
    currentStoreType = STORE_TYPE
    // Register the mockable once, pointing to a function that always returns the current fakeStrategy
    replaceMockable(getSessionStoreStrategy, () => fakeStrategy)
    replaceMockable(selectSessionStoreStrategyType, () => Promise.resolve(currentStoreType))

    registerCleanupTask(() => {
      stopSessionManager()
      clock.tick(SESSION_TIME_OUT_DELAY)
    })
  })

  async function startSessionManagerWithDefaults({
    configuration,
    trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED),
  }: {
    configuration?: Partial<Configuration>
    trackingConsentState?: TrackingConsentState
  } = {}): Promise<SessionManager> {
    const sessionManager = await startSessionManager(
      {
        sessionSampleRate: 100,
        ...configuration,
      } as Configuration,
      trackingConsentState
    )
    return sessionManager!
  }

  describe('initialization', () => {
    it('should not start if no session store strategy type is configured', async () => {
      const displayWarnSpy = vi.spyOn(display, 'warn')
      currentStoreType = undefined

      const sessionManager = await startSessionManager(
        {} as Configuration,
        createTrackingConsentState(TrackingConsent.GRANTED)
      )

      expect(displayWarnSpy).toHaveBeenCalledWith('No storage available for session. We will not send any data.')
      expect(sessionManager).toBeUndefined()
    })

    it('should call setSessionState to initialize the session', async () => {
      await startSessionManagerWithDefaults()

      expect(fakeStrategy.setSessionState).toHaveBeenCalled()
    })

    it('should resolve with undefined if session initialization fails', async () => {
      fakeStrategy.setSessionState.mockReturnValue(Promise.reject(new Error('storage failure')))

      const sessionManager = await startSessionManager(
        { sessionSampleRate: 100, trackAnonymousUser: false } as Configuration,
        createTrackingConsentState(TrackingConsent.GRANTED)
      )

      expect(sessionManager).toBeUndefined()
    })

    it('should resolve after initialization', async () => {
      const sessionManager = await startSessionManager(
        { sessionSampleRate: 100, trackAnonymousUser: false } as Configuration,
        createTrackingConsentState(TrackingConsent.GRANTED)
      )

      expect(sessionManager).toBeDefined()
    })

    it('should start with an active session on fresh initialization', async () => {
      await startSessionManagerWithDefaults()

      // Fresh init creates a session immediately (initialize + expand)
      const state = fakeStrategy.getInternalState()
      expect(state.isExpired).toBeUndefined()
      expect(state.id).toMatch(/^[a-f0-9-]+$/)
    })

    it('should create a session with a real id after user activity', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      expect(sessionManager.findSession()).toBeDefined()
      expect(sessionManager.findSession()!.id).toMatch(/^[a-f0-9-]+$/)
    })

    it('should generate an anonymousId when trackAnonymousUser is enabled', async () => {
      const sessionManager = await startSessionManagerWithDefaults({
        configuration: { trackAnonymousUser: true },
      })

      expect(sessionManager.findSession()!.anonymousId).toMatch(/^[a-f0-9-]+$/)
    })

    it('should not generate an anonymousId when trackAnonymousUser is disabled', async () => {
      const sessionManager = await startSessionManagerWithDefaults({
        configuration: { trackAnonymousUser: false },
      })

      expect(sessionManager.findSession()!.anonymousId).toBeUndefined()
    })

    it('should keep existing session when strategy has an active session', async () => {
      setupFakeStrategy({
        initialSession: {
          id: 'existing-id',
          expire: String(Date.now() + SESSION_EXPIRATION_DELAY),
          created: String(Date.now()),
        },
      })

      const sessionManager = await startSessionManagerWithDefaults()

      expect(sessionManager.findSession()!.id).toBe('existing-id')
    })
  })

  describe('session renewal', () => {
    it('should renew on user activity after expiration', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const renewSpy = vi.fn()
      sessionManager.renewObservable.subscribe(renewSpy)

      const initialId = sessionManager.findSession()!.id

      // Expire the session
      sessionManager.expire()

      expect(renewSpy).not.toHaveBeenCalled()

      // Wait for throttle to clear
      clock.tick(ONE_SECOND)

      // Activity triggers expandOrRenew
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      await collectAsyncCalls(sessionObservableSpy, 3) // 1 for initial session, 1 for expire, 1 for renew

      expect(renewSpy).toHaveBeenCalledTimes(1)
      expect(sessionManager.findSession()!.id).toBeDefined()
      expect(sessionManager.findSession()!.id).not.toBe(initialId)
    })

    it('should not renew on visibility check after expiration', async () => {
      setPageVisibility('visible')
      registerCleanupTask(restorePageVisibility)

      const sessionManager = await startSessionManagerWithDefaults()
      const renewSpy = vi.fn()
      sessionManager.renewObservable.subscribe(renewSpy)

      sessionManager.expire()

      clock.tick(VISIBILITY_CHECK_DELAY)

      expect(renewSpy).not.toHaveBeenCalled()
    })

    it('should throttle expandOrRenew calls from activity', async () => {
      await startSessionManagerWithDefaults()

      // The initial click + expandOrRenew already consumed the first throttle window.
      // Wait for throttle to clear.
      clock.tick(ONE_SECOND)

      const callCountBefore = fakeStrategy.setSessionState.mock.calls.length

      // Multiple rapid clicks within the throttle window
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      // Only one call (leading edge) should have fired immediately
      expect(fakeStrategy.setSessionState.mock.calls.length - callCountBefore).toBe(1)

      // After throttle delay, the trailing call fires (from the queued clicks)
      clock.tick(ONE_SECOND)

      // Leading (1) + trailing (1) = 2 calls total
      expect(fakeStrategy.setSessionState.mock.calls.length - callCountBefore).toBe(2)
    })
  })

  describe('session expiration', () => {
    it('should fire expireObservable when session expires', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const expireSpy = vi.fn()
      sessionManager.expireObservable.subscribe(expireSpy)

      sessionManager.expire()

      expect(expireSpy).toHaveBeenCalledTimes(1)
    })

    it('should only fire expireObservable once for multiple expire calls', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const expireSpy = vi.fn()
      sessionManager.expireObservable.subscribe(expireSpy)

      sessionManager.expire()
      sessionManager.expire()

      expect(expireSpy).toHaveBeenCalledTimes(1)
    })

    it('should set isExpired in the strategy state after expire()', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      const stateBefore = fakeStrategy.getInternalState()
      expect(stateBefore.isExpired).toBeUndefined()
      expect(stateBefore.id).toBeDefined()

      sessionManager.expire()

      const stateAfter = fakeStrategy.getInternalState()
      expect(stateAfter.isExpired).toBe(EXPIRED)
    })

    it('should renew on user activity after expire()', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const initialId = sessionManager.findSession()!.id

      sessionManager.expire()
      expect(sessionManager.findSession()).toBeUndefined()

      // Wait for throttle
      clock.tick(ONE_SECOND)

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      await collectAsyncCalls(sessionObservableSpy, 3) // 1 for initial session, 1 for expire, 1 for renew

      expect(sessionManager.findSession()).toBeDefined()
      expect(sessionManager.findSession()!.id).not.toBe(initialId)
    })
  })

  describe('automatic session expiration', () => {
    beforeEach(() => {
      setPageVisibility('hidden')
      registerCleanupTask(restorePageVisibility)
    })

    it('should expand session duration on activity', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      expect(sessionManager.findSession()).toBeDefined()

      clock.tick(SESSION_EXPIRATION_DELAY - 100)

      // Wait for throttle to clear before dispatching activity
      clock.tick(ONE_SECOND)

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      // Session should still be active (expire time was extended)
      const state = fakeStrategy.getInternalState()
      expect(state.expire).toBeDefined()
      expect(Number(state.expire)).toBeGreaterThan(Date.now())
    })

    it('should expand session on visibility when visible', async () => {
      setPageVisibility('visible')

      const sessionManager = await startSessionManagerWithDefaults()

      expect(sessionManager.findSession()).toBeDefined()

      const initialExpire = fakeStrategy.getInternalState().expire

      clock.tick(VISIBILITY_CHECK_DELAY)

      // Visibility check should have expanded the session
      const newExpire = fakeStrategy.getInternalState().expire
      expect(Number(newExpire)).toBeGreaterThan(Number(initialExpire))
    })

    it('should not expand expired session on visibility check', async () => {
      setPageVisibility('visible')

      const sessionManager = await startSessionManagerWithDefaults()
      sessionManager.expire()

      const stateAfterExpire = fakeStrategy.getInternalState()
      expect(stateAfterExpire.isExpired).toBe(EXPIRED)

      clock.tick(VISIBILITY_CHECK_DELAY)

      // expandOnly should not modify an expired session
      const state = fakeStrategy.getInternalState()
      expect(state.isExpired).toBe(EXPIRED)
    })

    it('should not expand another tab session via visibility check after expiration', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      sessionManager.expire()

      // Simulate another tab writing its own session to the shared store
      const otherTabExpire = String(Date.now() + SESSION_EXPIRATION_DELAY)
      fakeStrategy.simulateExternalChange({
        id: 'other-tab-session',
        created: String(Date.now()),
        expire: otherTabExpire,
      })

      clock.tick(VISIBILITY_CHECK_DELAY)

      // The other tab's expire should not have been pushed forward
      expect(fakeStrategy.getInternalState().expire).toBe(otherTabExpire)
    })

    it('should expire session after SESSION_EXPIRATION_DELAY without any activity in a hidden tab', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const expireSpy = vi.fn()
      sessionManager.expireObservable.subscribe(expireSpy)

      expect(sessionManager.findSession()).toBeDefined()

      // Advance past the session expiration delay without any user activity
      clock.tick(SESSION_EXPIRATION_DELAY + ONE_SECOND)

      await collectAsyncCalls(expireSpy, 1)

      expect(expireSpy).toHaveBeenCalledTimes(1)
      expect(sessionManager.findSession()).toBeUndefined()
    })

    it('should expire session after SESSION_TIME_OUT_DELAY even on a continuously visible page', async () => {
      setPageVisibility('visible')
      const sessionManager = await startSessionManagerWithDefaults()
      const expireSpy = vi.fn()
      sessionManager.expireObservable.subscribe(expireSpy)

      expect(sessionManager.findSession()).toBeDefined()

      // Fast forward to the end of the session
      clock.tick(SESSION_TIME_OUT_DELAY)
      // Drain the pending setSessionState microtasks so that scheduleExpirationTimeout runs
      // and registers the 0ms expiry timeout.
      await waitNextMicrotask()
      // Fire the 0ms expiry timeout.
      clock.tick(0)

      await collectAsyncCalls(expireSpy, 1)

      expect(fakeStrategy.getInternalState()).toEqual({ isExpired: EXPIRED })
      expect(expireSpy).toHaveBeenCalledTimes(1)
      expect(sessionManager.findSession()).toBeUndefined()
    })
  })

  describe('cross-tab changes (simulateExternalChange)', () => {
    it('should not adopt a session created by another tab when it replaces our session directly', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const renewSpy = vi.fn()
      sessionManager.renewObservable.subscribe(renewSpy)

      // Another tab expires our session and immediately starts a new one
      fakeStrategy.simulateExternalChange({
        id: 'other-tab-session',
        expire: String(Date.now() + SESSION_EXPIRATION_DELAY),
        created: String(Date.now()),
      })

      expect(renewSpy).not.toHaveBeenCalled()
      expect(sessionManager.findSession()).toBeUndefined()
    })

    it('should update session context in history when forcedReplay changes externally', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const currentId = sessionManager.findSession()!.id
      const currentState = fakeStrategy.getInternalState()

      expect(sessionManager.findSession()!.isReplayForced).toBe(false)

      fakeStrategy.simulateExternalChange({
        ...currentState,
        id: currentId,
        forcedReplay: '1',
      })

      expect(sessionManager.findSession()!.isReplayForced).toBe(true)
    })

    it('should fire expireObservable when external change removes the session', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const expireSpy = vi.fn()
      sessionManager.expireObservable.subscribe(expireSpy)

      fakeStrategy.simulateExternalChange({ isExpired: EXPIRED })

      expect(expireSpy).toHaveBeenCalledTimes(1)
      expect(sessionManager.findSession()).toBeUndefined()
    })

    it('should not adopt a session created by another tab after expiry', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const renewSpy = vi.fn()
      sessionManager.renewObservable.subscribe(renewSpy)

      // First expire
      sessionManager.expire()

      // Then another tab creates a new session
      fakeStrategy.simulateExternalChange({
        id: 'new-session-from-other-tab',
        expire: String(Date.now() + SESSION_EXPIRATION_DELAY),
        created: String(Date.now()),
      })

      expect(renewSpy).not.toHaveBeenCalled()
      expect(sessionManager.findSession()).toBeUndefined()
    })
  })

  describe('tracking consent', () => {
    it('should expire the session when tracking consent is withdrawn', async () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      const sessionManager = await startSessionManagerWithDefaults({ trackingConsentState })

      expect(sessionManager.findSession()).toBeDefined()

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)

      expect(sessionManager.findSession()).toBeUndefined()
      expect(fakeStrategy.getInternalState().isExpired).toBe(EXPIRED)
    })

    it('should not renew on activity when tracking consent is withdrawn', async () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      const sessionManager = await startSessionManagerWithDefaults({ trackingConsentState })

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)

      clock.tick(ONE_SECOND)
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expect(sessionManager.findSession()).toBeUndefined()
    })

    it('should renew the session when tracking consent is re-granted', async () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      const sessionManager = await startSessionManagerWithDefaults({ trackingConsentState })
      const initialId = sessionManager.findSession()!.id

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)

      expect(sessionManager.findSession()).toBeUndefined()

      trackingConsentState.update(TrackingConsent.GRANTED)

      await collectAsyncCalls(sessionObservableSpy, 3) // 1 for initial session, 1 for expire, 1 for renew

      expect(sessionManager.findSession()).toBeDefined()
      expect(sessionManager.findSession()!.id).not.toBe(initialId)
    })

    it('should remove anonymousId when tracking consent is withdrawn', async () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      await startSessionManagerWithDefaults({
        trackingConsentState,
        configuration: { trackAnonymousUser: true },
      })

      expect(fakeStrategy.getInternalState().anonymousId).toBeDefined()

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)

      expect(fakeStrategy.getInternalState().anonymousId).toBeUndefined()
    })

    it('should not install the session manager while consent stays revoked after being revoked during init', async () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)

      const initResolvers: Array<() => void> = []
      const delayedStrategy = createFakeSessionStoreStrategy()
      delayedStrategy.setSessionState = vi
        .fn()
        .mockImplementation((fn: (state: SessionState) => SessionState): Promise<void> => {
          fn({})
          return new Promise<void>((resolve) => {
            initResolvers.push(resolve)
          })
        })

      fakeStrategy = delayedStrategy

      const sessionManagerResolution = vi.fn()
      void startSessionManager(
        {
          sessionSampleRate: 100,
          trackAnonymousUser: false,
        } as Configuration,
        trackingConsentState
      ).then(sessionManagerResolution)

      // Allow startSessionManager to await selectSessionStoreStrategyType and call setSessionState
      await waitNextMicrotask()

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)
      initResolvers[0]()
      await flushMicrotasks()

      expect(sessionManagerResolution).not.toHaveBeenCalled()
    })

    it('should install the session manager when consent is granted again after being revoked during init', async () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)

      const initResolvers: Array<() => void> = []
      const delayedStrategy = createFakeSessionStoreStrategy()
      delayedStrategy.setSessionState = vi
        .fn()
        .mockImplementation((fn: (state: SessionState) => SessionState): Promise<void> => {
          fn({})
          return new Promise<void>((resolve) => {
            initResolvers.push(resolve)
          })
        })

      fakeStrategy = delayedStrategy

      const sessionManagerPromise = startSessionManager(
        {
          sessionSampleRate: 100,
          trackAnonymousUser: false,
        } as Configuration,
        trackingConsentState
      )

      // Allow startSessionManager to await selectSessionStoreStrategyType and call setSessionState
      await waitNextMicrotask()

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)
      initResolvers[0]()
      await flushMicrotasks()

      trackingConsentState.update(TrackingConsent.GRANTED)
      await flushMicrotasks()

      // After re-grant, the loop re-resolves the initial state
      expect(initResolvers.length).toBeGreaterThanOrEqual(2)
      initResolvers[initResolvers.length - 1]()

      const sessionManager = await sessionManagerPromise
      expect(sessionManager).toBeDefined()
    })

    it('should expire the session in storage while consent stays revoked during init', async () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)

      const initResolvers: Array<() => void> = []
      const setStateCalls: Array<(state: SessionState) => SessionState> = []
      const delayedStrategy = createFakeSessionStoreStrategy()
      delayedStrategy.setSessionState = vi
        .fn()
        .mockImplementation((fn: (state: SessionState) => SessionState): Promise<void> => {
          setStateCalls.push(fn)
          fn({})
          return new Promise<void>((resolve) => {
            initResolvers.push(resolve)
          })
        })

      fakeStrategy = delayedStrategy

      void startSessionManager(
        {
          sessionSampleRate: 100,
          trackAnonymousUser: false,
        } as Configuration,
        trackingConsentState
      )

      // Allow startSessionManager to await selectSessionStoreStrategyType and call setSessionState
      await waitNextMicrotask()

      const initialCallCount = setStateCalls.length

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)
      initResolvers[0]()
      await flushMicrotasks()

      // expire() should have triggered an additional setSessionState call to mark the cookie expired
      expect(setStateCalls.length).toBeGreaterThan(initialCallCount)
    })
  })

  describe('findSession', () => {
    it('should return the current session when no startTime is provided', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      const session = sessionManager.findSession()
      expect(session).toBeDefined()
      expect(session!.id).toBeDefined()
    })

    it('should return undefined when the session is expired and no startTime is provided', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      sessionManager.expire()

      expect(sessionManager.findSession()).toBeUndefined()
    })

    it('should return the session at the given startTime from history', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      const firstId = sessionManager.findSession()!.id

      // Advance time, expire, then renew
      clock.tick(10 * ONE_SECOND)
      sessionManager.expire()

      clock.tick(10 * ONE_SECOND)
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      await collectAsyncCalls(sessionObservableSpy, 3) // 1 for initial session, 1 for expire, 1 for renew

      const secondId = sessionManager.findSession()!.id

      // Look up first session at t=5s
      expect(sessionManager.findSession(clock.relative(5 * ONE_SECOND))!.id).toBe(firstId)
      // Look up gap at t=15s
      expect(sessionManager.findSession(clock.relative(15 * ONE_SECOND))).toBeUndefined()
      // Look up second session at t=25s
      expect(sessionManager.findSession(clock.relative(25 * ONE_SECOND))!.id).toBe(secondId)
    })

    it('should return the current session context in the renewObservable callback', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      let currentSession: ReturnType<SessionManager['findSession']>
      sessionManager.renewObservable.subscribe(() => {
        currentSession = sessionManager.findSession()
      })

      sessionManager.expire()
      clock.tick(ONE_SECOND)
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      await collectAsyncCalls(sessionObservableSpy, 3) // 1 for initial session, 1 for expire, 1 for renew

      expect(currentSession!).toBeDefined()
    })

    it('should still return the session in the expireObservable callback (before history close)', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      let currentSession: ReturnType<SessionManager['findSession']>
      sessionManager.expireObservable.subscribe(() => {
        currentSession = sessionManager.findSession()
      })

      sessionManager.expire()

      // expireObservable fires before sessionContextHistory.closeActive, so the session is still findable
      expect(currentSession!).toBeDefined()
    })

    describe('option returnInactive', () => {
      it('should return the session even when expired if returnInactive is true', async () => {
        const sessionManager = await startSessionManagerWithDefaults()

        clock.tick(10 * ONE_SECOND)
        sessionManager.expire()
        clock.tick(10 * ONE_SECOND)

        expect(sessionManager.findSession(clock.relative(15 * ONE_SECOND), { returnInactive: true })).toBeDefined()
        expect(sessionManager.findSession(clock.relative(15 * ONE_SECOND), { returnInactive: false })).toBeUndefined()
      })
    })
  })

  describe('findTrackedSession', () => {
    it('should return undefined when session is not sampled (sessionSampleRate: 0)', async () => {
      const sessionManager = await startSessionManagerWithDefaults({
        configuration: { sessionSampleRate: 0 },
      })

      expect(sessionManager.findTrackedSession()).toBeUndefined()
    })

    it('should return the session when sampled (sessionSampleRate: 100)', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      const session = sessionManager.findTrackedSession()
      expect(session).toBeDefined()
      expect(session!.id).toBeDefined()
    })

    it('should pass through startTime and options', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      clock.tick(10 * ONE_SECOND)
      sessionManager.expire()
      clock.tick(10 * ONE_SECOND)

      expect(sessionManager.findTrackedSession(clock.relative(5 * ONE_SECOND))).toBeDefined()
      expect(sessionManager.findTrackedSession(clock.relative(15 * ONE_SECOND))).toBeUndefined()
    })

    it('should return isReplayForced from the session context', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      expect(sessionManager.findTrackedSession()!.isReplayForced).toBe(false)

      sessionManager.updateSessionState({ forcedReplay: '1' })
      await collectAsyncCalls(sessionObservableSpy, 2) // 1 for initial session, 1 for updateSessionState

      expect(sessionManager.findTrackedSession()!.isReplayForced).toBe(true)
    })

    it('should return the session if it has expired when returnInactive is true', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      sessionManager.expire()

      expect(sessionManager.findTrackedSession(undefined, { returnInactive: true })).toBeDefined()
    })

    it('should return undefined when the session is older than TRACKED_SESSION_MAX_AGE', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      fakeStrategy.simulateExternalChange({
        id: LOW_HASH_UUID,
        created: String(Date.now() - TRACKED_SESSION_MAX_AGE - 1),
        expire: String(Date.now() + SESSION_EXPIRATION_DELAY),
      })

      await collectAsyncCalls(sessionObservableSpy, 2) // 1 for initial session, 1 for external change

      expect(sessionManager.findTrackedSession()).toBeUndefined()
    })

    describe('deterministic sampling', () => {
      it('should track a session whose ID has a low hash, even with a low sessionSampleRate', async () => {
        setupFakeStrategy({
          initialSession: {
            id: LOW_HASH_UUID,
            expire: String(Date.now() + SESSION_EXPIRATION_DELAY),
            created: String(Date.now()),
          },
        })

        const sessionManager = await startSessionManagerWithDefaults({
          configuration: { sessionSampleRate: 1 },
        })

        expect(sessionManager.findTrackedSession()).toBeDefined()
      })

      it('should not track a session whose ID has a high hash, even with a high sessionSampleRate', async () => {
        setupFakeStrategy({
          initialSession: {
            id: HIGH_HASH_UUID,
            expire: String(Date.now() + SESSION_EXPIRATION_DELAY),
            created: String(Date.now()),
          },
        })

        const sessionManager = await startSessionManagerWithDefaults({
          configuration: { sessionSampleRate: 99 },
        })

        expect(sessionManager.findTrackedSession()).toBeUndefined()
      })
    })
  })

  describe('updateSessionState', () => {
    it('should merge partial state via setSessionState', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const callCountBefore = fakeStrategy.setSessionState.mock.calls.length

      sessionManager.updateSessionState({ extra: 'value' })

      expect(fakeStrategy.setSessionState.mock.calls.length).toBe(callCountBefore + 1)
      expect(fakeStrategy.getInternalState().extra).toBe('value')
    })

    it('should rebuild session context when forcedReplay is updated', async () => {
      const sessionManager = await startSessionManagerWithDefaults()

      expect(sessionManager.findSession()!.isReplayForced).toBe(false)

      sessionManager.updateSessionState({ forcedReplay: '1' })
      await collectAsyncCalls(sessionObservableSpy, 2) // 1 for initial session, 1 for updateSessionState

      expect(sessionManager.findSession()!.isReplayForced).toBe(true)
    })
  })

  describe('resume from frozen tab', () => {
    it('should do nothing when session is still active', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const initialId = sessionManager.findSession()!.id

      window.dispatchEvent(createNewEvent(DOM_EVENT.RESUME))

      expect(sessionManager.findSession()!.id).toBe(initialId)
    })

    it('should reinitialize session in store when store is empty', async () => {
      await startSessionManagerWithDefaults()

      // Simulate store being cleared (e.g., by another tab or browser clearing storage)
      fakeStrategy.simulateExternalChange({})

      window.dispatchEvent(createNewEvent(DOM_EVENT.RESUME))

      // initializeSession on empty state creates an expired state
      const state = fakeStrategy.getInternalState()
      expect(state.isExpired).toBe(EXPIRED)
    })
  })

  describe('multiple startSessionManager calls', () => {
    it('should re-use the same session when sharing a strategy', async () => {
      const firstManager = await startSessionManagerWithDefaults()
      // Second manager shares the same fakeStrategy
      const secondManager = await startSessionManagerWithDefaults()

      // The second manager inherits the state from the strategy (which already has a session)
      expect(firstManager?.findSession()!.id).toBe(secondManager?.findSession()!.id)
    })

    it('should notify expire observables on both managers when session expires externally', async () => {
      const firstManager = await startSessionManagerWithDefaults()
      const secondManager = await startSessionManagerWithDefaults()

      const expireSpy1 = vi.fn()
      const expireSpy2 = vi.fn()

      firstManager?.expireObservable.subscribe(expireSpy1)
      secondManager?.expireObservable.subscribe(expireSpy2)

      // Expire via external change
      fakeStrategy.simulateExternalChange({ isExpired: EXPIRED })

      expect(expireSpy1).toHaveBeenCalled()
      expect(expireSpy2).toHaveBeenCalled()
    })
  })

  describe('session timeout', () => {
    it('should create a new session when the existing session has timed out', async () => {
      setupFakeStrategy({
        initialSession: {
          id: 'old-session',
          created: String(Date.now() - SESSION_TIME_OUT_DELAY - 1),
          expire: String(Date.now() + SESSION_EXPIRATION_DELAY),
        },
      })

      // The timed-out session is treated as expired by isSessionInExpiredState
      // initializeSession keeps it as-is (since it's not empty), but it's expired
      const sessionManager = await startSessionManagerWithDefaults()

      // After user activity (from startSessionManagerWithDefaults), a new session is created
      expect(sessionManager.findSession()).toBeDefined()
      expect(sessionManager.findSession()!.id).not.toBe('old-session')
    })
  })

  describe('stop', () => {
    it('should stop listening to activity events after stopSessionManager', async () => {
      await startSessionManagerWithDefaults()

      stopSessionManager()

      // Wait for throttle to clear
      clock.tick(ONE_SECOND)

      const callCountAfterStop = fakeStrategy.setSessionState.mock.calls.length

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expect(fakeStrategy.setSessionState.mock.calls.length).toBe(callCountAfterStop)
    })

    it('should unsubscribe from strategy observable after stopSessionManager', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      const renewSpy = vi.fn()
      sessionManager.renewObservable.subscribe(renewSpy)

      stopSessionManager()

      // External change should not trigger renew
      fakeStrategy.simulateExternalChange({
        id: 'new-external-session',
        expire: String(Date.now() + SESSION_EXPIRATION_DELAY),
        created: String(Date.now()),
      })

      expect(renewSpy).not.toHaveBeenCalled()
    })
  })
})

describe('startSessionManagerStub', () => {
  it('should always return a tracked session', async () => {
    const sessionManager = await startSessionManagerStub()
    expect(sessionManager.findTrackedSession()).toBeDefined()
    expect(sessionManager.findTrackedSession()!.id).toBeDefined()
  })

  it('should allow updating session state', async () => {
    const sessionManager = await startSessionManagerStub()

    sessionManager.updateSessionState({ extra: 'value' })

    expect(sessionManager.findSession()).toBeDefined()
  })
})

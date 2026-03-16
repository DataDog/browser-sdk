import {
  createFakeSessionStoreStrategy,
  createNewEvent,
  HIGH_HASH_UUID,
  LOW_HASH_UUID,
  mockClock,
  registerCleanupTask,
  replaceMockable,
  restorePageVisibility,
  setPageVisibility,
} from '../../../test'
import type { Clock } from '../../../test'
import { DOM_EVENT } from '../../browser/addEventListener'
import { display } from '../../tools/display'
import { ONE_SECOND } from '../../tools/utils/timeUtils'
import type { Configuration } from '../configuration'
import type { TrackingConsentState } from '../trackingConsent'
import { TrackingConsent, createTrackingConsentState } from '../trackingConsent'
import type { SessionManager } from './sessionManager'
import {
  getSessionStoreStrategy,
  startSessionManager,
  startSessionManagerStub,
  stopSessionManager,
  VISIBILITY_CHECK_DELAY,
} from './sessionManager'
import { SESSION_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY, SessionPersistence } from './sessionConstants'
import type { SessionStoreStrategyType } from './storeStrategies/sessionStoreStrategy'
import type { SessionState } from './sessionState'
import { EXPIRED } from './sessionState'

describe('startSessionManager', () => {
  const STORE_TYPE: SessionStoreStrategyType = { type: SessionPersistence.COOKIE, cookieOptions: {} }
  let fakeStrategy: ReturnType<typeof createFakeSessionStoreStrategy>
  let clock: Clock

  /**
   * Creates a fresh fake strategy and updates the mockable reference.
   * Since `replaceMockable` can only be called once per test, we use a mutable
   * container that always returns the current `fakeStrategy`.
   */
  function setupFakeStrategy(options?: Parameters<typeof createFakeSessionStoreStrategy>[0]) {
    fakeStrategy = createFakeSessionStoreStrategy(options)
  }

  beforeEach(() => {
    clock = mockClock()
    fakeStrategy = createFakeSessionStoreStrategy()
    // Register the mockable once, pointing to a function that always returns the current fakeStrategy
    replaceMockable(getSessionStoreStrategy, () => fakeStrategy)

    registerCleanupTask(() => {
      stopSessionManager()
      clock.tick(SESSION_TIME_OUT_DELAY)
    })
  })

  /**
   * Helper to start a session manager and activate a session via user activity.
   * After initialization with a fresh (empty) strategy, the session starts in an expired
   * state. A click event triggers `expandOrRenew`, which creates a real session ID.
   */
  function startSessionManagerWithDefaults({
    configuration,
    trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED),
  }: {
    configuration?: Partial<Configuration>
    trackingConsentState?: TrackingConsentState
  } = {}): SessionManager {
    let sessionManager: SessionManager | undefined
    startSessionManager(
      {
        sessionStoreStrategyType: STORE_TYPE,
        sessionSampleRate: 100,
        trackAnonymousUser: false,
        ...configuration,
      } as Configuration,
      trackingConsentState,
      (sm) => {
        sessionManager = sm
      }
    )
    // With the fake strategy, onReady fires synchronously
    expect(sessionManager).toBeDefined()

    // Trigger user activity to create an actual session (fresh init starts as expired)
    document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

    return sessionManager!
  }

  /**
   * Same as startSessionManagerWithDefaults but skips the automatic activity trigger.
   * Used for tests that need to observe the raw initialization behavior.
   */
  function startSessionManagerRaw({
    configuration,
    trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED),
  }: {
    configuration?: Partial<Configuration>
    trackingConsentState?: TrackingConsentState
  } = {}): SessionManager {
    let sessionManager: SessionManager | undefined
    startSessionManager(
      {
        sessionStoreStrategyType: STORE_TYPE,
        sessionSampleRate: 100,
        trackAnonymousUser: false,
        ...configuration,
      } as Configuration,
      trackingConsentState,
      (sm) => {
        sessionManager = sm
      }
    )
    expect(sessionManager).toBeDefined()
    return sessionManager!
  }

  describe('initialization', () => {
    it('should not start if no session store strategy type is configured', () => {
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

    it('should call setSessionState to initialize the session', () => {
      startSessionManagerRaw()

      expect(fakeStrategy.setSessionState).toHaveBeenCalled()
    })

    it('should fire onReady after first emission', () => {
      const onReadySpy = jasmine.createSpy('onReady')

      startSessionManager(
        { sessionStoreStrategyType: STORE_TYPE, sessionSampleRate: 100, trackAnonymousUser: false } as Configuration,
        createTrackingConsentState(TrackingConsent.GRANTED),
        onReadySpy
      )

      expect(onReadySpy).toHaveBeenCalledTimes(1)
    })

    it('should start with an active session on fresh initialization', () => {
      startSessionManagerRaw()

      // Fresh init creates a session immediately (initialize + expand)
      const state = fakeStrategy.getInternalState()
      expect(state.isExpired).toBeUndefined()
      expect(state.id).toMatch(/^[a-f0-9-]+$/)
    })

    it('should create a session with a real id after user activity', () => {
      const sessionManager = startSessionManagerWithDefaults()

      expect(sessionManager.findSession()).toBeDefined()
      expect(sessionManager.findSession()!.id).toMatch(/^[a-f0-9-]+$/)
    })

    it('should generate an anonymousId when trackAnonymousUser is enabled', () => {
      const sessionManager = startSessionManagerWithDefaults({
        configuration: { trackAnonymousUser: true },
      })

      expect(sessionManager.findSession()!.anonymousId).toMatch(/^[a-f0-9-]+$/)
    })

    it('should not generate an anonymousId when trackAnonymousUser is disabled', () => {
      const sessionManager = startSessionManagerWithDefaults({
        configuration: { trackAnonymousUser: false },
      })

      expect(sessionManager.findSession()!.anonymousId).toBeUndefined()
    })

    it('should keep existing session when strategy has an active session', () => {
      setupFakeStrategy({
        initialSession: {
          id: 'existing-id',
          expire: String(Date.now() + SESSION_EXPIRATION_DELAY),
          created: String(Date.now()),
        },
      })

      const sessionManager = startSessionManagerRaw()

      expect(sessionManager.findSession()!.id).toBe('existing-id')
    })
  })

  describe('session renewal', () => {
    it('should renew on user activity after expiration', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const renewSpy = jasmine.createSpy('renew')
      sessionManager.renewObservable.subscribe(renewSpy)

      const initialId = sessionManager.findSession()!.id

      // Expire the session
      sessionManager.expire()

      expect(renewSpy).not.toHaveBeenCalled()

      // Wait for throttle to clear
      clock.tick(ONE_SECOND)

      // Activity triggers expandOrRenew
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expect(renewSpy).toHaveBeenCalledTimes(1)
      expect(sessionManager.findSession()!.id).toBeDefined()
      expect(sessionManager.findSession()!.id).not.toBe(initialId)
    })

    it('should not renew on visibility check after expiration', () => {
      setPageVisibility('visible')
      registerCleanupTask(restorePageVisibility)

      const sessionManager = startSessionManagerWithDefaults()
      const renewSpy = jasmine.createSpy('renew')
      sessionManager.renewObservable.subscribe(renewSpy)

      sessionManager.expire()

      clock.tick(VISIBILITY_CHECK_DELAY)

      expect(renewSpy).not.toHaveBeenCalled()
    })

    it('should throttle expandOrRenew calls from activity', () => {
      startSessionManagerWithDefaults()

      // The initial click + expandOrRenew already consumed the first throttle window.
      // Wait for throttle to clear.
      clock.tick(ONE_SECOND)

      const callCountBefore = fakeStrategy.setSessionState.calls.count()

      // Multiple rapid clicks within the throttle window
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      // Only one call (leading edge) should have fired immediately
      expect(fakeStrategy.setSessionState.calls.count() - callCountBefore).toBe(1)

      // After throttle delay, the trailing call fires (from the queued clicks)
      clock.tick(ONE_SECOND)

      // Leading (1) + trailing (1) = 2 calls total
      expect(fakeStrategy.setSessionState.calls.count() - callCountBefore).toBe(2)
    })
  })

  describe('session expiration', () => {
    it('should fire expireObservable when session expires', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const expireSpy = jasmine.createSpy('expire')
      sessionManager.expireObservable.subscribe(expireSpy)

      sessionManager.expire()

      expect(expireSpy).toHaveBeenCalledTimes(1)
    })

    it('should only fire expireObservable once for multiple expire calls', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const expireSpy = jasmine.createSpy('expire')
      sessionManager.expireObservable.subscribe(expireSpy)

      sessionManager.expire()
      sessionManager.expire()

      expect(expireSpy).toHaveBeenCalledTimes(1)
    })

    it('should set isExpired in the strategy state after expire()', () => {
      const sessionManager = startSessionManagerWithDefaults()

      const stateBefore = fakeStrategy.getInternalState()
      expect(stateBefore.isExpired).toBeUndefined()
      expect(stateBefore.id).toBeDefined()

      sessionManager.expire()

      const stateAfter = fakeStrategy.getInternalState()
      expect(stateAfter.isExpired).toBe(EXPIRED)
    })

    it('should renew on user activity after expire()', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const initialId = sessionManager.findSession()!.id

      sessionManager.expire()
      expect(sessionManager.findSession()).toBeUndefined()

      // Wait for throttle
      clock.tick(ONE_SECOND)

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expect(sessionManager.findSession()).toBeDefined()
      expect(sessionManager.findSession()!.id).not.toBe(initialId)
    })
  })

  describe('automatic session expiration', () => {
    beforeEach(() => {
      setPageVisibility('hidden')
      registerCleanupTask(restorePageVisibility)
    })

    it('should expand session duration on activity', () => {
      const sessionManager = startSessionManagerWithDefaults()

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

    it('should expand session on visibility when visible', () => {
      setPageVisibility('visible')

      const sessionManager = startSessionManagerWithDefaults()

      expect(sessionManager.findSession()).toBeDefined()

      const initialExpire = fakeStrategy.getInternalState().expire

      clock.tick(VISIBILITY_CHECK_DELAY)

      // Visibility check should have expanded the session
      const newExpire = fakeStrategy.getInternalState().expire
      expect(Number(newExpire)).toBeGreaterThan(Number(initialExpire))
    })

    it('should not expand expired session on visibility check', () => {
      setPageVisibility('visible')

      const sessionManager = startSessionManagerWithDefaults()
      sessionManager.expire()

      const stateAfterExpire = fakeStrategy.getInternalState()
      expect(stateAfterExpire.isExpired).toBe(EXPIRED)

      clock.tick(VISIBILITY_CHECK_DELAY)

      // expandOnly should not modify an expired session
      const state = fakeStrategy.getInternalState()
      expect(state.isExpired).toBe(EXPIRED)
    })
  })

  describe('cross-tab changes (simulateExternalChange)', () => {
    it('should fire expireObservable and renewObservable when external change has a different session ID', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const expireSpy = jasmine.createSpy('expire')
      const renewSpy = jasmine.createSpy('renew')
      sessionManager.expireObservable.subscribe(expireSpy)
      sessionManager.renewObservable.subscribe(renewSpy)

      const initialId = sessionManager.findSession()!.id

      // Another tab changes the session
      fakeStrategy.simulateExternalChange({
        id: 'other-tab-session',
        expire: String(Date.now() + SESSION_EXPIRATION_DELAY),
        created: String(Date.now()),
      })

      expect(expireSpy).toHaveBeenCalledTimes(1)
      expect(renewSpy).toHaveBeenCalledTimes(1)
      expect(sessionManager.findSession()!.id).toBe('other-tab-session')
      expect(sessionManager.findSession()!.id).not.toBe(initialId)
    })

    it('should fire sessionStateUpdateObservable when external change has same session ID with changed properties', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const updateSpy = jasmine.createSpy('sessionStateUpdate')
      sessionManager.sessionStateUpdateObservable.subscribe(updateSpy)

      const currentId = sessionManager.findSession()!.id
      const currentState = fakeStrategy.getInternalState()

      fakeStrategy.simulateExternalChange({
        ...currentState,
        id: currentId,
        forcedReplay: '1',
      })

      expect(updateSpy).toHaveBeenCalledTimes(1)
      const { previousState, newState } = updateSpy.calls.argsFor(0)[0]
      expect(previousState.forcedReplay).toBeUndefined()
      expect(newState.forcedReplay).toBe('1')
    })

    it('should update session context in history when forcedReplay changes externally', () => {
      const sessionManager = startSessionManagerWithDefaults()
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

    it('should fire expireObservable when external change removes the session', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const expireSpy = jasmine.createSpy('expire')
      sessionManager.expireObservable.subscribe(expireSpy)

      fakeStrategy.simulateExternalChange({ isExpired: EXPIRED })

      expect(expireSpy).toHaveBeenCalledTimes(1)
      expect(sessionManager.findSession()).toBeUndefined()
    })

    it('should fire renewObservable when external change creates a session from expired state', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const renewSpy = jasmine.createSpy('renew')
      sessionManager.renewObservable.subscribe(renewSpy)

      // First expire
      sessionManager.expire()

      // Then another tab creates a new session
      fakeStrategy.simulateExternalChange({
        id: 'new-session-from-other-tab',
        expire: String(Date.now() + SESSION_EXPIRATION_DELAY),
        created: String(Date.now()),
      })

      expect(renewSpy).toHaveBeenCalledTimes(1)
      expect(sessionManager.findSession()!.id).toBe('new-session-from-other-tab')
    })
  })

  describe('tracking consent', () => {
    it('should expire the session when tracking consent is withdrawn', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      const sessionManager = startSessionManagerWithDefaults({ trackingConsentState })

      expect(sessionManager.findSession()).toBeDefined()

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)

      expect(sessionManager.findSession()).toBeUndefined()
      expect(fakeStrategy.getInternalState().isExpired).toBe(EXPIRED)
    })

    it('should not renew on activity when tracking consent is withdrawn', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      const sessionManager = startSessionManagerWithDefaults({ trackingConsentState })

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)

      clock.tick(ONE_SECOND)
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expect(sessionManager.findSession()).toBeUndefined()
    })

    it('should renew the session when tracking consent is re-granted', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      const sessionManager = startSessionManagerWithDefaults({ trackingConsentState })
      const initialId = sessionManager.findSession()!.id

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)

      expect(sessionManager.findSession()).toBeUndefined()

      trackingConsentState.update(TrackingConsent.GRANTED)

      expect(sessionManager.findSession()).toBeDefined()
      expect(sessionManager.findSession()!.id).not.toBe(initialId)
    })

    it('should remove anonymousId when tracking consent is withdrawn', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      startSessionManagerWithDefaults({
        trackingConsentState,
        configuration: { trackAnonymousUser: true },
      })

      expect(fakeStrategy.getInternalState().anonymousId).toBeDefined()

      trackingConsentState.update(TrackingConsent.NOT_GRANTED)

      expect(fakeStrategy.getInternalState().anonymousId).toBeUndefined()
    })

    it('should expire the session when consent is revoked before first emission', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)

      // Create a strategy that doesn't auto-notify (to simulate async init)
      let pendingNotify: (() => void) | undefined
      const delayedStrategy = createFakeSessionStoreStrategy()
      delayedStrategy.setSessionState = delayedStrategy.setSessionState.and.callFake(
        (fn: (state: SessionState) => SessionState): Promise<void> => {
          const newState = fn({})
          pendingNotify = () => delayedStrategy.sessionObservable.notify({ ...newState })
          return Promise.resolve()
        }
      )

      fakeStrategy = delayedStrategy

      const onReadySpy = jasmine.createSpy('onReady')
      startSessionManager(
        {
          sessionStoreStrategyType: STORE_TYPE,
          sessionSampleRate: 100,
          trackAnonymousUser: false,
        } as Configuration,
        trackingConsentState,
        onReadySpy
      )

      // Consent revoked before first emission
      trackingConsentState.update(TrackingConsent.NOT_GRANTED)

      // First emission arrives
      pendingNotify!()

      // onReady should not have been called because consent was revoked
      expect(onReadySpy).not.toHaveBeenCalled()
    })
  })

  describe('findSession', () => {
    it('should return the current session when no startTime is provided', () => {
      const sessionManager = startSessionManagerWithDefaults()

      const session = sessionManager.findSession()
      expect(session).toBeDefined()
      expect(session!.id).toBeDefined()
    })

    it('should return undefined when the session is expired and no startTime is provided', () => {
      const sessionManager = startSessionManagerWithDefaults()

      sessionManager.expire()

      expect(sessionManager.findSession()).toBeUndefined()
    })

    it('should return the session at the given startTime from history', () => {
      const sessionManager = startSessionManagerWithDefaults()

      const firstId = sessionManager.findSession()!.id

      // Advance time, expire, then renew
      clock.tick(10 * ONE_SECOND)
      sessionManager.expire()

      clock.tick(10 * ONE_SECOND)
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      const secondId = sessionManager.findSession()!.id

      // Look up first session at t=5s
      expect(sessionManager.findSession(clock.relative(5 * ONE_SECOND))!.id).toBe(firstId)
      // Look up gap at t=15s
      expect(sessionManager.findSession(clock.relative(15 * ONE_SECOND))).toBeUndefined()
      // Look up second session at t=25s
      expect(sessionManager.findSession(clock.relative(25 * ONE_SECOND))!.id).toBe(secondId)
    })

    it('should return the current session context in the renewObservable callback', () => {
      const sessionManager = startSessionManagerWithDefaults()
      let currentSession: ReturnType<SessionManager['findSession']>
      sessionManager.renewObservable.subscribe(() => {
        currentSession = sessionManager.findSession()
      })

      sessionManager.expire()
      clock.tick(ONE_SECOND)
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expect(currentSession!).toBeDefined()
    })

    it('should still return the session in the expireObservable callback (before history close)', () => {
      const sessionManager = startSessionManagerWithDefaults()
      let currentSession: ReturnType<SessionManager['findSession']>
      sessionManager.expireObservable.subscribe(() => {
        currentSession = sessionManager.findSession()
      })

      sessionManager.expire()

      // expireObservable fires before sessionContextHistory.closeActive, so the session is still findable
      expect(currentSession!).toBeDefined()
    })

    describe('option returnInactive', () => {
      it('should return the session even when expired if returnInactive is true', () => {
        const sessionManager = startSessionManagerWithDefaults()

        clock.tick(10 * ONE_SECOND)
        sessionManager.expire()
        clock.tick(10 * ONE_SECOND)

        expect(sessionManager.findSession(clock.relative(15 * ONE_SECOND), { returnInactive: true })).toBeDefined()
        expect(sessionManager.findSession(clock.relative(15 * ONE_SECOND), { returnInactive: false })).toBeUndefined()
      })
    })
  })

  describe('findTrackedSession', () => {
    it('should return undefined when session is not sampled (sessionSampleRate: 0)', () => {
      const sessionManager = startSessionManagerWithDefaults({
        configuration: { sessionSampleRate: 0 },
      })

      expect(sessionManager.findTrackedSession()).toBeUndefined()
    })

    it('should return the session when sampled (sessionSampleRate: 100)', () => {
      const sessionManager = startSessionManagerWithDefaults()

      const session = sessionManager.findTrackedSession()
      expect(session).toBeDefined()
      expect(session!.id).toBeDefined()
    })

    it('should pass through startTime and options', () => {
      const sessionManager = startSessionManagerWithDefaults()

      clock.tick(10 * ONE_SECOND)
      sessionManager.expire()
      clock.tick(10 * ONE_SECOND)

      expect(sessionManager.findTrackedSession(clock.relative(5 * ONE_SECOND))).toBeDefined()
      expect(sessionManager.findTrackedSession(clock.relative(15 * ONE_SECOND))).toBeUndefined()
    })

    it('should return isReplayForced from the session context', () => {
      const sessionManager = startSessionManagerWithDefaults()

      expect(sessionManager.findTrackedSession()!.isReplayForced).toBe(false)

      sessionManager.updateSessionState({ forcedReplay: '1' })

      expect(sessionManager.findTrackedSession()!.isReplayForced).toBe(true)
    })

    it('should return the session if it has expired when returnInactive is true', () => {
      const sessionManager = startSessionManagerWithDefaults()

      sessionManager.expire()

      expect(sessionManager.findTrackedSession(undefined, { returnInactive: true })).toBeDefined()
    })

    describe('deterministic sampling', () => {
      beforeEach(() => {
        if (!window.BigInt) {
          pending('BigInt is not supported')
        }
      })

      it('should track a session whose ID has a low hash, even with a low sessionSampleRate', () => {
        setupFakeStrategy({
          initialSession: {
            id: LOW_HASH_UUID,
            expire: String(Date.now() + SESSION_EXPIRATION_DELAY),
            created: String(Date.now()),
          },
        })

        const sessionManager = startSessionManagerRaw({
          configuration: { sessionSampleRate: 1 },
        })

        expect(sessionManager.findTrackedSession()).toBeDefined()
      })

      it('should not track a session whose ID has a high hash, even with a high sessionSampleRate', () => {
        setupFakeStrategy({
          initialSession: {
            id: HIGH_HASH_UUID,
            expire: String(Date.now() + SESSION_EXPIRATION_DELAY),
            created: String(Date.now()),
          },
        })

        const sessionManager = startSessionManagerRaw({
          configuration: { sessionSampleRate: 99 },
        })

        expect(sessionManager.findTrackedSession()).toBeUndefined()
      })
    })
  })

  describe('updateSessionState', () => {
    it('should merge partial state via setSessionState', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const callCountBefore = fakeStrategy.setSessionState.calls.count()

      sessionManager.updateSessionState({ extra: 'value' })

      expect(fakeStrategy.setSessionState.calls.count()).toBe(callCountBefore + 1)
      expect(fakeStrategy.getInternalState().extra).toBe('value')
    })

    it('should notify sessionStateUpdateObservable', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const updateSpy = jasmine.createSpy('sessionStateUpdate')
      sessionManager.sessionStateUpdateObservable.subscribe(updateSpy)

      sessionManager.updateSessionState({ extra: 'extra' })

      expect(updateSpy).toHaveBeenCalledTimes(1)
      const { previousState, newState } = updateSpy.calls.argsFor(0)[0]
      expect(previousState.extra).toBeUndefined()
      expect(newState.extra).toBe('extra')
    })

    it('should rebuild session context when forcedReplay is updated', () => {
      const sessionManager = startSessionManagerWithDefaults()

      expect(sessionManager.findSession()!.isReplayForced).toBe(false)

      sessionManager.updateSessionState({ forcedReplay: '1' })

      expect(sessionManager.findSession()!.isReplayForced).toBe(true)
    })
  })

  describe('resume from frozen tab', () => {
    it('should do nothing when session is still active', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const initialId = sessionManager.findSession()!.id

      window.dispatchEvent(createNewEvent(DOM_EVENT.RESUME))

      expect(sessionManager.findSession()!.id).toBe(initialId)
    })

    it('should reinitialize session in store when store is empty', () => {
      startSessionManagerWithDefaults()

      // Simulate store being cleared (e.g., by another tab or browser clearing storage)
      fakeStrategy.simulateExternalChange({})

      window.dispatchEvent(createNewEvent(DOM_EVENT.RESUME))

      // initializeSession on empty state creates an expired state
      const state = fakeStrategy.getInternalState()
      expect(state.isExpired).toBe(EXPIRED)
    })
  })

  describe('multiple startSessionManager calls', () => {
    it('should re-use the same session when sharing a strategy', () => {
      const firstManager = startSessionManagerWithDefaults()
      // Second manager shares the same fakeStrategy
      const secondManager = startSessionManagerRaw()

      // The second manager inherits the state from the strategy (which already has a session)
      expect(firstManager.findSession()!.id).toBe(secondManager.findSession()!.id)
    })

    it('should notify expire observables on both managers when session expires externally', () => {
      const firstManager = startSessionManagerWithDefaults()
      const secondManager = startSessionManagerRaw()

      const expireSpy1 = jasmine.createSpy('expire1')
      const expireSpy2 = jasmine.createSpy('expire2')

      firstManager.expireObservable.subscribe(expireSpy1)
      secondManager.expireObservable.subscribe(expireSpy2)

      // Expire via external change
      fakeStrategy.simulateExternalChange({ isExpired: EXPIRED })

      expect(expireSpy1).toHaveBeenCalled()
      expect(expireSpy2).toHaveBeenCalled()
    })
  })

  describe('session timeout', () => {
    it('should create a new session when the existing session has timed out', () => {
      setupFakeStrategy({
        initialSession: {
          id: 'old-session',
          created: String(Date.now() - SESSION_TIME_OUT_DELAY),
          expire: String(Date.now() + SESSION_EXPIRATION_DELAY),
        },
      })

      // The timed-out session is treated as expired by isSessionInExpiredState
      // initializeSession keeps it as-is (since it's not empty), but it's expired
      const sessionManager = startSessionManagerWithDefaults()

      // After user activity (from startSessionManagerWithDefaults), a new session is created
      expect(sessionManager.findSession()).toBeDefined()
      expect(sessionManager.findSession()!.id).not.toBe('old-session')
    })
  })

  describe('stop', () => {
    it('should stop listening to activity events after stopSessionManager', () => {
      startSessionManagerWithDefaults()

      stopSessionManager()

      // Wait for throttle to clear
      clock.tick(ONE_SECOND)

      const callCountAfterStop = fakeStrategy.setSessionState.calls.count()

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expect(fakeStrategy.setSessionState.calls.count()).toBe(callCountAfterStop)
    })

    it('should unsubscribe from strategy observable after stopSessionManager', () => {
      const sessionManager = startSessionManagerWithDefaults()
      const renewSpy = jasmine.createSpy('renew')
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
  it('should always return a tracked session', () => {
    let sessionManager: SessionManager | undefined
    startSessionManagerStub((sm) => {
      sessionManager = sm
    })
    expect(sessionManager!.findTrackedSession()).toBeDefined()
    expect(sessionManager!.findTrackedSession()!.id).toBeDefined()
  })

  it('should allow updating session state', () => {
    let sessionManager: SessionManager | undefined
    startSessionManagerStub((sm) => {
      sessionManager = sm
    })

    sessionManager!.updateSessionState({ extra: 'value' })

    expect(sessionManager!.findSession()).toBeDefined()
  })
})

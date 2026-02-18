import type { RelativeTime, SessionManager, TrackedSession } from '@datadog/browser-core'
import {
  STORAGE_POLL_DELAY,
  SESSION_STORE_KEY,
  setCookie,
  stopSessionManager,
  startSessionManager,
  startSessionManagerStub,
  ONE_SECOND,
  DOM_EVENT,
  createTrackingConsentState,
  TrackingConsent,
} from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import {
  createNewEvent,
  expireCookie,
  getSessionState,
  HIGH_HASH_UUID,
  LOW_HASH_UUID,
  MID_HASH_UUID,
  mockClock,
  registerCleanupTask,
} from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../test'
import type { RumConfiguration } from './configuration'

import { SessionReplayState, computeSessionReplayState } from './sessionReplayState'

describe('rum session manager', () => {
  const DURATION = 123456
  let expireSessionSpy: jasmine.Spy
  let renewSessionSpy: jasmine.Spy
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    expireSessionSpy = jasmine.createSpy('expireSessionSpy')
    renewSessionSpy = jasmine.createSpy('renewSessionSpy')

    registerCleanupTask(() => {
      // remove intervals first
      stopSessionManager()
      // flush pending callbacks to avoid random failures
      clock.tick(new Date().getTime())
    })
  })

  describe('cookie storage', () => {
    it('when tracked should store session id', async () => {
      const { sessionManager } = await startSessionManagerWithDefaults()

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()

      expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/[a-f0-9-]/)
      expect(sessionManager.findTrackedSession(100)!.id).toBeDefined()
    })

    it('when not tracked should still store session id and compute tracking type on demand', async () => {
      const { sessionManager } = await startSessionManagerWithDefaults({ configuration: { sessionSampleRate: 0 } })

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      // Session ID is always stored now
      expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/[a-f0-9-]/)
      expect(getSessionState(SESSION_STORE_KEY).isExpired).not.toBeDefined()
      // Tracking type is computed on demand
      expect(sessionManager.findTrackedSession(0)).toBeUndefined()
    })

    it('when tracked should keep existing session id', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)

      const { sessionManager } = await startSessionManagerWithDefaults()

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      expect(getSessionState(SESSION_STORE_KEY).id).toBe('00000000-0000-0000-0000-000000abcdef')
      expect(sessionManager.findTrackedSession(100)!.id).toBe('00000000-0000-0000-0000-000000abcdef')
    })

    it('should renew on activity after expiration', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)

      const { sessionManager } = await startSessionManagerWithDefaults()

      expireCookie()
      expect(getSessionState(SESSION_STORE_KEY).isExpired).toBe('1')
      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      clock.tick(STORAGE_POLL_DELAY)

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expect(expireSessionSpy).toHaveBeenCalled()
      expect(renewSessionSpy).toHaveBeenCalled()
      expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/[a-f0-9-]/)
      expect(sessionManager.findTrackedSession(100)!.id).toBeDefined()
    })
  })

  describe('findTrackedSession', () => {
    it('should return the current session', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)
      const { sessionManager } = await startSessionManagerWithDefaults()
      expect(sessionManager.findTrackedSession(100)!.id).toBe('00000000-0000-0000-0000-000000abcdef')
    })

    it('should return undefined if the session is not tracked', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)
      const { sessionManager } = await startSessionManagerWithDefaults({ configuration: { sessionSampleRate: 0 } })
      expect(sessionManager.findTrackedSession(0)).toBe(undefined)
    })

    it('should return undefined if the session has expired', async () => {
      const { sessionManager } = await startSessionManagerWithDefaults()
      expireCookie()
      clock.tick(STORAGE_POLL_DELAY)
      expect(sessionManager.findTrackedSession(100)).toBe(undefined)
    })

    it('should return session corresponding to start time', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)
      const { sessionManager } = await startSessionManagerWithDefaults()
      clock.tick(10 * ONE_SECOND)
      expireCookie()
      clock.tick(STORAGE_POLL_DELAY)
      expect(sessionManager.findTrackedSession(100)).toBeUndefined()
      expect(sessionManager.findTrackedSession(100, 0 as RelativeTime)!.id).toBe('00000000-0000-0000-0000-000000abcdef')
    })
  })

  describe('deterministic sampling', () => {
    describe('with bigint support', () => {
      beforeEach(() => {
        if (!window.BigInt) {
          pending('BigInt is not supported')
        }
      })

      it('should track a session whose ID has a low hash, even with a low sessionSampleRate', async () => {
        setCookie(SESSION_STORE_KEY, `id=${LOW_HASH_UUID}`, DURATION)
        const { sessionManager } = await startSessionManagerWithDefaults({ configuration: { sessionSampleRate: 1 } })
        expect(sessionManager.findTrackedSession(1)).toBeDefined()
      })

      it('should not track a session whose ID has a high hash, even with a high sessionSampleRate', async () => {
        setCookie(SESSION_STORE_KEY, `id=${HIGH_HASH_UUID}`, DURATION)
        const { sessionManager } = await startSessionManagerWithDefaults({ configuration: { sessionSampleRate: 99 } })
        expect(sessionManager.findTrackedSession(99)).toBeUndefined()
      })
    })
  })

  function startSessionManagerWithDefaults({ configuration }: { configuration?: Partial<RumConfiguration> } = {}) {
    const rumConfiguration = mockRumConfiguration({
      sessionSampleRate: 100,
      sessionReplaySampleRate: 100,
      trackResources: true,
      trackLongTasks: true,
      ...configuration,
    })
    return new Promise<{ sessionManager: SessionManager; configuration: RumConfiguration }>((resolve) => {
      startSessionManager(rumConfiguration, createTrackingConsentState(TrackingConsent.GRANTED), (sessionManager) => {
        sessionManager.expireObservable.subscribe(expireSessionSpy)
        sessionManager.renewObservable.subscribe(renewSessionSpy)
        resolve({ sessionManager, configuration: rumConfiguration })
      })
    })
  }
})

describe('computeSessionReplayState', () => {
  describe('with bigint support', () => {
    beforeEach(() => {
      if (!window.BigInt) {
        pending('BigInt is not supported')
      }
    })

    it('should return SAMPLED when replay is sampled in', () => {
      const session: TrackedSession = { id: LOW_HASH_UUID, anonymousId: undefined, isReplayForced: false }
      const configuration = mockRumConfiguration({ sessionSampleRate: 100, sessionReplaySampleRate: 100 })
      expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.SAMPLED)
    })

    it('should return OFF when replay is sampled out', () => {
      const session: TrackedSession = { id: HIGH_HASH_UUID, anonymousId: undefined, isReplayForced: false }
      const configuration = mockRumConfiguration({ sessionSampleRate: 100, sessionReplaySampleRate: 99 })
      expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.OFF)
    })

    it('should return FORCED when replay is forced', () => {
      const session: TrackedSession = { id: HIGH_HASH_UUID, anonymousId: undefined, isReplayForced: true }
      const configuration = mockRumConfiguration({ sessionSampleRate: 100, sessionReplaySampleRate: 0 })
      expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.FORCED)
    })

    it('should apply the correction factor for chained sampling on the replay sample rate', () => {
      // MID_HASH_UUID has a hash of ~50.7%. With sessionSampleRate=60 and sessionReplaySampleRate=60:
      // - Without correction: isSampled(id, 60) → true (50.7 < 60)
      // - With correction: isSampled(id, 60*60/100=36) → false (50.7 > 36)
      const session: TrackedSession = { id: MID_HASH_UUID, anonymousId: undefined, isReplayForced: false }
      const configuration = mockRumConfiguration({ sessionSampleRate: 60, sessionReplaySampleRate: 60 })
      expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.OFF)
    })

    it('should sample replay for a session whose ID has a low hash, even with a low sessionReplaySampleRate', () => {
      const session: TrackedSession = { id: LOW_HASH_UUID, anonymousId: undefined, isReplayForced: false }
      const configuration = mockRumConfiguration({ sessionSampleRate: 100, sessionReplaySampleRate: 1 })
      expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.SAMPLED)
    })

    it('should not sample replay for a session whose ID has a high hash, even with a high sessionReplaySampleRate', () => {
      const session: TrackedSession = { id: HIGH_HASH_UUID, anonymousId: undefined, isReplayForced: false }
      const configuration = mockRumConfiguration({ sessionSampleRate: 100, sessionReplaySampleRate: 99 })
      expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.OFF)
    })
  })
})

describe('session manager stub', () => {
  it('should return a tracked session', () => {
    let sessionManager: SessionManager | undefined
    startSessionManagerStub((sm) => {
      sessionManager = sm
    })
    expect(sessionManager!.findTrackedSession(100)!.id).toBeDefined()
  })
})

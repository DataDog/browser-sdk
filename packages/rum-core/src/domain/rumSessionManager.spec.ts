import type { RelativeTime } from '@datadog/browser-core'
import {
  STORAGE_POLL_DELAY,
  SESSION_STORE_KEY,
  setCookie,
  stopSessionManager,
  ONE_SECOND,
  DOM_EVENT,
  createTrackingConsentState,
  TrackingConsent,
  BridgeCapability,
} from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import {
  createNewEvent,
  expireCookie,
  getSessionState,
  HIGH_HASH_UUID,
  LOW_HASH_UUID,
  MID_HASH_UUID,
  mockEventBridge,
  mockClock,
  registerCleanupTask,
} from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../test'
import type { RumConfiguration } from './configuration'

import type { RumSessionManager } from './rumSessionManager'
import { SessionReplayState, startRumSessionManager, startRumSessionManagerStub } from './rumSessionManager'

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
    it('when tracked with session replay should store session id', async () => {
      const rumSessionManager = await startRumSessionManagerWithDefaults()

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()

      expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/[a-f0-9-]/)
      // Tracking type is computed on demand, not stored
      expect(rumSessionManager.findTrackedSession()!.sessionReplay).toBe(SessionReplayState.SAMPLED)
    })

    it('when tracked without session replay should store session id', async () => {
      const rumSessionManager = await startRumSessionManagerWithDefaults({
        configuration: { sessionReplaySampleRate: 0 },
      })

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/[a-f0-9-]/)
      // Tracking type is computed on demand, not stored
      expect(rumSessionManager.findTrackedSession()!.sessionReplay).toBe(SessionReplayState.OFF)
    })

    it('when not tracked should still store session id and compute tracking type on demand', async () => {
      const rumSessionManager = await startRumSessionManagerWithDefaults({ configuration: { sessionSampleRate: 0 } })

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      // Session ID is always stored now
      expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/[a-f0-9-]/)
      expect(getSessionState(SESSION_STORE_KEY).isExpired).not.toBeDefined()
      // Tracking type is computed on demand
      expect(rumSessionManager.findTrackedSession()).toBeUndefined()
    })

    it('when tracked should keep existing session id', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)

      const rumSessionManager = await startRumSessionManagerWithDefaults()

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      expect(getSessionState(SESSION_STORE_KEY).id).toBe('00000000-0000-0000-0000-000000abcdef')
      expect(rumSessionManager.findTrackedSession()!.id).toBe('00000000-0000-0000-0000-000000abcdef')
    })

    it('should renew on activity after expiration', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)

      const rumSessionManager = await startRumSessionManagerWithDefaults()

      expireCookie()
      expect(getSessionState(SESSION_STORE_KEY).isExpired).toBe('1')
      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()
      clock.tick(STORAGE_POLL_DELAY)

      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expect(expireSessionSpy).toHaveBeenCalled()
      expect(renewSessionSpy).toHaveBeenCalled()
      expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/[a-f0-9-]/)
      expect(rumSessionManager.findTrackedSession()!.sessionReplay).toBe(SessionReplayState.SAMPLED)
    })
  })

  describe('findSession', () => {
    it('should return the current session', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)
      const rumSessionManager = await startRumSessionManagerWithDefaults()
      expect(rumSessionManager.findTrackedSession()!.id).toBe('00000000-0000-0000-0000-000000abcdef')
    })

    it('should return undefined if the session is not tracked', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)
      const rumSessionManager = await startRumSessionManagerWithDefaults({ configuration: { sessionSampleRate: 0 } })
      expect(rumSessionManager.findTrackedSession()).toBe(undefined)
    })

    it('should return undefined if the session has expired', async () => {
      const rumSessionManager = await startRumSessionManagerWithDefaults()
      expireCookie()
      clock.tick(STORAGE_POLL_DELAY)
      expect(rumSessionManager.findTrackedSession()).toBe(undefined)
    })

    it('should return session corresponding to start time', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)
      const rumSessionManager = await startRumSessionManagerWithDefaults()
      clock.tick(10 * ONE_SECOND)
      expireCookie()
      clock.tick(STORAGE_POLL_DELAY)
      expect(rumSessionManager.findTrackedSession()).toBeUndefined()
      expect(rumSessionManager.findTrackedSession(0 as RelativeTime)!.id).toBe('00000000-0000-0000-0000-000000abcdef')
    })

    it('should return session with SAMPLED replay state when fully tracked', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)
      const rumSessionManager = await startRumSessionManagerWithDefaults({
        configuration: { sessionSampleRate: 100, sessionReplaySampleRate: 100 },
      })
      expect(rumSessionManager.findTrackedSession()!.sessionReplay).toBe(SessionReplayState.SAMPLED)
    })

    it('should return session with OFF replay state when tracked without replay', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)
      const rumSessionManager = await startRumSessionManagerWithDefaults({
        configuration: { sessionSampleRate: 100, sessionReplaySampleRate: 0 },
      })
      expect(rumSessionManager.findTrackedSession()!.sessionReplay).toBe(SessionReplayState.OFF)
    })

    it('should update current entity when replay recording is forced', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)
      const rumSessionManager = await startRumSessionManagerWithDefaults({
        configuration: { sessionSampleRate: 100, sessionReplaySampleRate: 0 },
      })
      rumSessionManager.setForcedReplay()

      expect(rumSessionManager.findTrackedSession()!.sessionReplay).toBe(SessionReplayState.FORCED)
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
        const rumSessionManager = await startRumSessionManagerWithDefaults({ configuration: { sessionSampleRate: 1 } })
        expect(rumSessionManager.findTrackedSession()).toBeDefined()
      })

      it('should not track a session whose ID has a high hash, even with a high sessionSampleRate', async () => {
        setCookie(SESSION_STORE_KEY, `id=${HIGH_HASH_UUID}`, DURATION)
        const rumSessionManager = await startRumSessionManagerWithDefaults({ configuration: { sessionSampleRate: 99 } })
        expect(rumSessionManager.findTrackedSession()).toBeUndefined()
      })

      it('should sample replay for a session whose ID has a low hash, even with a low sessionReplaySampleRate', async () => {
        setCookie(SESSION_STORE_KEY, `id=${LOW_HASH_UUID}`, DURATION)
        const rumSessionManager = await startRumSessionManagerWithDefaults({
          configuration: { sessionReplaySampleRate: 1 },
        })
        expect(rumSessionManager.findTrackedSession()!.sessionReplay).toBe(SessionReplayState.SAMPLED)
      })

      it('should not sample replay for a session whose ID has a high hash, even with a high sessionReplaySampleRate', async () => {
        setCookie(SESSION_STORE_KEY, `id=${HIGH_HASH_UUID}`, DURATION)
        const rumSessionManager = await startRumSessionManagerWithDefaults({
          configuration: { sessionReplaySampleRate: 99 },
        })
        expect(rumSessionManager.findTrackedSession()!.sessionReplay).toBe(SessionReplayState.OFF)
      })

      it('should apply the correction factor for chained sampling on the replay sample rate', async () => {
        // MID_HASH_UUID has a hash of ~50.7%. With sessionSampleRate=60 and sessionReplaySampleRate=60:
        // - Without correction: isSampled(id, 60) → true (50.7 < 60)
        // - With correction: isSampled(id, 60*60/100=36) → false (50.7 > 36)
        setCookie(SESSION_STORE_KEY, `id=${MID_HASH_UUID}`, DURATION)
        const rumSessionManager = await startRumSessionManagerWithDefaults({
          configuration: { sessionSampleRate: 60, sessionReplaySampleRate: 60 },
        })
        expect(rumSessionManager.findTrackedSession()!.sessionReplay).toBe(SessionReplayState.OFF)
      })
    })
  })

  describe('session behaviors', () => {
    ;[
      {
        description: 'TRACKED_WITH_SESSION_REPLAY should have replay',
        sessionReplaySampleRate: 100,
        expectSessionReplay: SessionReplayState.SAMPLED,
      },
      {
        description: 'TRACKED_WITHOUT_SESSION_REPLAY should have no replay',
        sessionReplaySampleRate: 0,
        expectSessionReplay: SessionReplayState.OFF,
      },
    ].forEach(
      ({
        description,
        sessionReplaySampleRate,
        expectSessionReplay,
      }: {
        description: string
        sessionReplaySampleRate: number
        expectSessionReplay: SessionReplayState
      }) => {
        it(description, async () => {
          const rumSessionManager = await startRumSessionManagerWithDefaults({
            configuration: { sessionReplaySampleRate },
          })
          expect(rumSessionManager.findTrackedSession()!.sessionReplay).toBe(expectSessionReplay)
        })
      }
    )
  })

  function startRumSessionManagerWithDefaults({ configuration }: { configuration?: Partial<RumConfiguration> } = {}) {
    return new Promise<RumSessionManager>((resolve) => {
      startRumSessionManager(
        mockRumConfiguration({
          sessionSampleRate: 100,
          sessionReplaySampleRate: 100,
          trackResources: true,
          trackLongTasks: true,
          ...configuration,
        }),
        createTrackingConsentState(TrackingConsent.GRANTED),
        (sessionManager) => {
          sessionManager.expireObservable.subscribe(expireSessionSpy)
          sessionManager.renewObservable.subscribe(renewSessionSpy)
          resolve(sessionManager)
        }
      )
    })
  }
})

describe('rum session manager stub', () => {
  it('should return a tracked session with replay allowed when the event bridge support records', () => {
    mockEventBridge({ capabilities: [BridgeCapability.RECORDS] })
    let sessionManager: RumSessionManager | undefined
    startRumSessionManagerStub({} as RumConfiguration, createTrackingConsentState(TrackingConsent.GRANTED), (sm) => {
      sessionManager = sm
    })
    expect(sessionManager!.findTrackedSession()!.sessionReplay).toEqual(SessionReplayState.SAMPLED)
  })

  it('should return a tracked session without replay allowed when the event bridge support records', () => {
    mockEventBridge({ capabilities: [] })
    let sessionManager: RumSessionManager | undefined
    startRumSessionManagerStub({} as RumConfiguration, createTrackingConsentState(TrackingConsent.GRANTED), (sm) => {
      sessionManager = sm
    })
    expect(sessionManager!.findTrackedSession()!.sessionReplay).toEqual(SessionReplayState.OFF)
  })
})

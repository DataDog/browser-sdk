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
  mockEventBridge,
  mockClock,
  registerCleanupTask,
} from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../test'
import type { RumConfiguration } from './configuration'

import type { RumSessionManager } from './rumSessionManager'
import {
  SessionReplayState,
  startRumSessionManager,
  startRumSessionManagerStub,
} from './rumSessionManager'

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
      const rumSessionManager = await startRumSessionManagerWithDefaults({
        configuration: { sessionSampleRate: 100, sessionReplaySampleRate: 100 },
      })

      expect(expireSessionSpy).not.toHaveBeenCalled()
      expect(renewSessionSpy).not.toHaveBeenCalled()

      expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/[a-f0-9-]/)
      // Tracking type is computed on demand, not stored
      expect(rumSessionManager.findTrackedSession()!.sessionReplay).toBe(SessionReplayState.SAMPLED)
    })

    it('when tracked without session replay should store session id', async () => {
      const rumSessionManager = await startRumSessionManagerWithDefaults({
        configuration: { sessionSampleRate: 100, sessionReplaySampleRate: 0 },
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

      const rumSessionManager = await startRumSessionManagerWithDefaults({
        configuration: { sessionSampleRate: 100, sessionReplaySampleRate: 100 },
      })

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
            configuration: { sessionSampleRate: 100, sessionReplaySampleRate },
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
          sessionSampleRate: 50,
          sessionReplaySampleRate: 50,
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
    expect(startRumSessionManagerStub().findTrackedSession()!.sessionReplay).toEqual(SessionReplayState.SAMPLED)
  })

  it('should return a tracked session without replay allowed when the event bridge support records', () => {
    mockEventBridge({ capabilities: [] })
    expect(startRumSessionManagerStub().findTrackedSession()!.sessionReplay).toEqual(SessionReplayState.OFF)
  })
})

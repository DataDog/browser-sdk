import type { RelativeTime, SessionManager } from '@datadog/browser-core'
import {
  STORAGE_POLL_DELAY,
  SESSION_STORE_KEY,
  setCookie,
  stopSessionManager,
  startSessionManager,
  startSessionManagerStub,
  ONE_SECOND,
  DOM_EVENT,
  relativeNow,
  createTrackingConsentState,
  TrackingConsent,
  SessionPersistence,
} from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { createNewEvent, expireCookie, getSessionState, mockClock } from '@datadog/browser-core/test'

import type { LogsConfiguration } from './configuration'

describe('logs session manager (via core SessionManager)', () => {
  const DURATION = 123456
  const SESSION_SAMPLE_RATE = 100
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
  })

  afterEach(() => {
    // remove intervals first
    stopSessionManager()
    // flush pending callbacks to avoid random failures
    clock.tick(new Date().getTime())
  })

  it('when tracked should store session id', async () => {
    const sessionManager = await startSessionManagerWithDefaults()

    expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/[a-f0-9-]+/)
    expect(sessionManager.findTrackedSession(SESSION_SAMPLE_RATE)).toBeDefined()
  })

  it('when not tracked should still store session id and compute tracking type on demand', async () => {
    const sessionManager = await startSessionManagerWithDefaults({ configuration: { sessionSampleRate: 0 } })

    // Session ID is always stored now
    expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/[a-f0-9-]+/)
    expect(getSessionState(SESSION_STORE_KEY).isExpired).toBeUndefined()
    // Tracking type is computed on demand
    expect(sessionManager.findTrackedSession(0)).toBeUndefined()
  })

  it('when tracked should keep existing session id', async () => {
    setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)

    const sessionManager = await startSessionManagerWithDefaults()

    expect(getSessionState(SESSION_STORE_KEY).id).toBe('00000000-0000-0000-0000-000000abcdef')
    expect(sessionManager.findTrackedSession(SESSION_SAMPLE_RATE)!.id).toBe('00000000-0000-0000-0000-000000abcdef')
  })

  it('should renew on activity after expiration', async () => {
    const sessionManager = await startSessionManagerWithDefaults()

    expireCookie()
    expect(getSessionState(SESSION_STORE_KEY).isExpired).toBe('1')
    clock.tick(STORAGE_POLL_DELAY)

    document.body.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

    expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/[a-f0-9-]+/)
    expect(sessionManager.findTrackedSession(SESSION_SAMPLE_RATE)).toBeDefined()
  })

  describe('findTrackedSession', () => {
    it('should return the current active session', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)
      const sessionManager = await startSessionManagerWithDefaults()
      expect(sessionManager.findTrackedSession(SESSION_SAMPLE_RATE)!.id).toBe('00000000-0000-0000-0000-000000abcdef')
    })

    it('should return undefined if the session is not tracked', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)
      const sessionManager = await startSessionManagerWithDefaults({ configuration: { sessionSampleRate: 0 } })
      expect(sessionManager.findTrackedSession(0)).toBeUndefined()
    })

    it('should not return the current session if it has expired by default', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)
      const sessionManager = await startSessionManagerWithDefaults()
      clock.tick(10 * ONE_SECOND)
      expireCookie()
      clock.tick(STORAGE_POLL_DELAY)
      expect(sessionManager.findTrackedSession(SESSION_SAMPLE_RATE)).toBeUndefined()
    })

    it('should return the current session if it has expired when returnInactive = true', async () => {
      const sessionManager = await startSessionManagerWithDefaults()
      expireCookie()
      clock.tick(STORAGE_POLL_DELAY)
      expect(
        sessionManager.findTrackedSession(SESSION_SAMPLE_RATE, relativeNow(), { returnInactive: true })
      ).toBeDefined()
    })

    it('should return session corresponding to start time', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000000001', DURATION)
      const sessionManager = await startSessionManagerWithDefaults()
      clock.tick(10 * ONE_SECOND)
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000000002', DURATION)
      // simulate a click to renew the session
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      clock.tick(STORAGE_POLL_DELAY)
      expect(sessionManager.findTrackedSession(SESSION_SAMPLE_RATE, 0 as RelativeTime)!.id).toEqual(
        '00000000-0000-0000-0000-000000000001'
      )
      expect(sessionManager.findTrackedSession(SESSION_SAMPLE_RATE)!.id).toEqual('00000000-0000-0000-0000-000000000002')
    })
  })

  function startSessionManagerWithDefaults({ configuration }: { configuration?: Partial<LogsConfiguration> } = {}) {
    const sampleRate = configuration?.sessionSampleRate ?? SESSION_SAMPLE_RATE
    return new Promise<SessionManager>((resolve) => {
      startSessionManager(
        {
          sessionSampleRate: sampleRate,
          sessionStoreStrategyType: { type: SessionPersistence.COOKIE, cookieOptions: {} },
          ...configuration,
        } as LogsConfiguration,
        createTrackingConsentState(TrackingConsent.GRANTED),
        resolve
      )
    })
  }
})

describe('session manager stub', () => {
  it('isTracked is computed at each findTrackedSession call', () => {
    let sessionManager: SessionManager | undefined
    startSessionManagerStub((sm) => {
      sessionManager = sm
    })
    expect(sessionManager!.findTrackedSession(100)).toBeDefined()
    expect(sessionManager!.findTrackedSession(100)!.id).toBeDefined()

    expect(sessionManager!.findTrackedSession(0)).toBeUndefined()
  })
})

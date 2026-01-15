import type { RelativeTime } from '@datadog/browser-core'
import {
  STORAGE_POLL_DELAY,
  SESSION_STORE_KEY,
  setCookie,
  stopSessionManager,
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
import type { LogsSessionManager } from './logsSessionManager'
import { startLogsSessionManager, startLogsSessionManagerStub } from './logsSessionManager'

describe('logs session manager', () => {
  const DURATION = 123456
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
    const logsSessionManager = await startLogsSessionManagerWithDefaults()

    expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/[a-f0-9-]+/)
    // Tracking type is computed on demand, not stored
    expect(logsSessionManager.findTrackedSession()).toBeDefined()
  })

  it('when not tracked should still store session id and compute tracking type on demand', async () => {
    const logsSessionManager = await startLogsSessionManagerWithDefaults({ configuration: { sessionSampleRate: 0 } })

    // Session ID is always stored now
    expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/[a-f0-9-]+/)
    expect(getSessionState(SESSION_STORE_KEY).isExpired).toBeUndefined()
    // Tracking type is computed on demand
    expect(logsSessionManager.findTrackedSession()).toBeUndefined()
  })

  it('when tracked should keep existing session id', async () => {
    setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)

    const logsSessionManager = await startLogsSessionManagerWithDefaults()

    expect(getSessionState(SESSION_STORE_KEY).id).toBe('00000000-0000-0000-0000-000000abcdef')
    expect(logsSessionManager.findTrackedSession()!.id).toBe('00000000-0000-0000-0000-000000abcdef')
  })

  it('should renew on activity after expiration', async () => {
    const logsSessionManager = await startLogsSessionManagerWithDefaults()

    expireCookie()
    expect(getSessionState(SESSION_STORE_KEY).isExpired).toBe('1')
    clock.tick(STORAGE_POLL_DELAY)

    document.body.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

    expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/[a-f0-9-]+/)
    expect(logsSessionManager.findTrackedSession()).toBeDefined()
  })

  describe('findTrackedSession', () => {
    it('should return the current active session', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)
      const logsSessionManager = await startLogsSessionManagerWithDefaults()
      expect(logsSessionManager.findTrackedSession()!.id).toBe('00000000-0000-0000-0000-000000abcdef')
    })

    it('should return undefined if the session is not tracked', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)
      const logsSessionManager = await startLogsSessionManagerWithDefaults({ configuration: { sessionSampleRate: 0 } })
      expect(logsSessionManager.findTrackedSession()).toBeUndefined()
    })

    it('should not return the current session if it has expired by default', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000abcdef', DURATION)
      const logsSessionManager = await startLogsSessionManagerWithDefaults()
      clock.tick(10 * ONE_SECOND)
      expireCookie()
      clock.tick(STORAGE_POLL_DELAY)
      expect(logsSessionManager.findTrackedSession()).toBeUndefined()
    })

    it('should return the current session if it has expired when returnExpired = true', async () => {
      const logsSessionManager = await startLogsSessionManagerWithDefaults()
      expireCookie()
      clock.tick(STORAGE_POLL_DELAY)
      expect(logsSessionManager.findTrackedSession(relativeNow(), { returnInactive: true })).toBeDefined()
    })

    it('should return session corresponding to start time', async () => {
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000000001', DURATION)
      const logsSessionManager = await startLogsSessionManagerWithDefaults()
      clock.tick(10 * ONE_SECOND)
      setCookie(SESSION_STORE_KEY, 'id=00000000-0000-0000-0000-000000000002', DURATION)
      // simulate a click to renew the session
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      clock.tick(STORAGE_POLL_DELAY)
      expect(logsSessionManager.findTrackedSession(0 as RelativeTime)!.id).toEqual(
        '00000000-0000-0000-0000-000000000001'
      )
      expect(logsSessionManager.findTrackedSession()!.id).toEqual('00000000-0000-0000-0000-000000000002')
    })
  })

  function startLogsSessionManagerWithDefaults({ configuration }: { configuration?: Partial<LogsConfiguration> } = {}) {
    return new Promise<LogsSessionManager>((resolve) => {
      startLogsSessionManager(
        {
          sessionSampleRate: 100,
          sessionStoreStrategyType: { type: SessionPersistence.COOKIE, cookieOptions: {} },
          ...configuration,
        } as LogsConfiguration,
        createTrackingConsentState(TrackingConsent.GRANTED),
        resolve
      )
    })
  }
})

describe('logger session stub', () => {
  it('isTracked is computed at each init and returns session id when tracked', () => {
    let sessionManager: LogsSessionManager | undefined
    startLogsSessionManagerStub(
      { sessionSampleRate: 100 } as LogsConfiguration,
      createTrackingConsentState(TrackingConsent.GRANTED),
      (sm) => {
        sessionManager = sm
      }
    )
    expect(sessionManager!.findTrackedSession()).toBeDefined()
    // Stub mode now generates a session ID for deterministic sampling
    expect(sessionManager!.findTrackedSession()!.id).toBeDefined()

    let sessionManager2: LogsSessionManager | undefined
    startLogsSessionManagerStub(
      { sessionSampleRate: 0 } as LogsConfiguration,
      createTrackingConsentState(TrackingConsent.GRANTED),
      (sm) => {
        sessionManager2 = sm
      }
    )
    expect(sessionManager2!.findTrackedSession()).toBeUndefined()
  })
})

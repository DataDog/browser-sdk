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
import {
  createNewEvent,
  expireCookie,
  getSessionState,
  mockClock,
  waitSessionOperations,
} from '@datadog/browser-core/test'

import type { LogsConfiguration } from './configuration'
import type { LogsSessionManager } from './logsSessionManager'
import {
  LOGS_SESSION_KEY,
  LoggerTrackingType,
  startLogsSessionManager,
  startLogsSessionManagerStub,
} from './logsSessionManager'

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

  it('when tracked should store tracking type and session id', async () => {
    await startLogsSessionManagerWithDefaults()

    expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/[a-f0-9-]+/)
    expect(getSessionState(SESSION_STORE_KEY)[LOGS_SESSION_KEY]).toBe(LoggerTrackingType.TRACKED)
  })

  it('when not tracked should store tracking type', async () => {
    await startLogsSessionManagerWithDefaults({ configuration: { sessionSampleRate: 0 } })

    expect(getSessionState(SESSION_STORE_KEY)[LOGS_SESSION_KEY]).toBe(LoggerTrackingType.NOT_TRACKED)
    expect(getSessionState(SESSION_STORE_KEY).isExpired).toBeUndefined()
  })

  it('when tracked should keep existing tracking type and session id', async () => {
    setCookie(SESSION_STORE_KEY, 'id=abcdef&logs=1', DURATION)

    await startLogsSessionManagerWithDefaults()

    expect(getSessionState(SESSION_STORE_KEY).id).toBe('abcdef')
    expect(getSessionState(SESSION_STORE_KEY)[LOGS_SESSION_KEY]).toBe(LoggerTrackingType.TRACKED)
  })

  it('when not tracked should keep existing tracking type', async () => {
    setCookie(SESSION_STORE_KEY, 'logs=0', DURATION)

    await startLogsSessionManagerWithDefaults()

    expect(getSessionState(SESSION_STORE_KEY)[LOGS_SESSION_KEY]).toBe(LoggerTrackingType.NOT_TRACKED)
  })

  it('should renew on activity after expiration', async () => {
    await startLogsSessionManagerWithDefaults()

    expireCookie()
    expect(getSessionState(SESSION_STORE_KEY).isExpired).toBe('1')
    clock.tick(STORAGE_POLL_DELAY)

    document.body.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

    await waitSessionOperations()

    expect(getSessionState(SESSION_STORE_KEY).id).toMatch(/[a-f0-9-]+/)
    expect(getSessionState(SESSION_STORE_KEY)[LOGS_SESSION_KEY]).toBe(LoggerTrackingType.TRACKED)
  })

  describe('findTrackedSession', () => {
    it('should return the current active session', async () => {
      setCookie(SESSION_STORE_KEY, 'id=abcdef&logs=1', DURATION)
      const logsSessionManager = await startLogsSessionManagerWithDefaults()
      expect(logsSessionManager.findTrackedSession()!.id).toBe('abcdef')
    })

    it('should return undefined if the session is not tracked', async () => {
      setCookie(SESSION_STORE_KEY, 'id=abcdef&logs=0', DURATION)
      const logsSessionManager = await startLogsSessionManagerWithDefaults()
      expect(logsSessionManager.findTrackedSession()).toBeUndefined()
    })

    it('should not return the current session if it has expired by default', async () => {
      setCookie(SESSION_STORE_KEY, 'id=abcdef&logs=1', DURATION)
      const logsSessionManager = await startLogsSessionManagerWithDefaults()
      clock.tick(10 * ONE_SECOND)
      expireCookie()
      clock.tick(STORAGE_POLL_DELAY)

      await waitSessionOperations()

      expect(logsSessionManager.findTrackedSession()).toBeUndefined()
    })

    it('should return the current session if it has expired when returnExpired = true', async () => {
      const logsSessionManager = await startLogsSessionManagerWithDefaults()
      expireCookie()
      clock.tick(STORAGE_POLL_DELAY)
      await waitSessionOperations()
      expect(logsSessionManager.findTrackedSession(relativeNow(), { returnInactive: true })).toBeDefined()
    })

    it('should return session corresponding to start time', async () => {
      setCookie(SESSION_STORE_KEY, 'id=foo&logs=1', DURATION)
      const logsSessionManager = await startLogsSessionManagerWithDefaults()
      clock.tick(10 * ONE_SECOND)
      setCookie(SESSION_STORE_KEY, 'id=bar&logs=1', DURATION)
      // simulate a click to renew the session
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      clock.tick(STORAGE_POLL_DELAY)
      await waitSessionOperations()
      expect(logsSessionManager.findTrackedSession(0 as RelativeTime)!.id).toEqual('foo')
      expect(logsSessionManager.findTrackedSession()!.id).toEqual('bar')
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
  it('isTracked is computed at each init and getId is always undefined', () => {
    const firstLogsSessionManager = startLogsSessionManagerStub({ sessionSampleRate: 100 } as LogsConfiguration)
    expect(firstLogsSessionManager.findTrackedSession()).toBeDefined()
    expect(firstLogsSessionManager.findTrackedSession()!.id).toBeUndefined()

    const secondLogsSessionManager = startLogsSessionManagerStub({ sessionSampleRate: 0 } as LogsConfiguration)
    expect(secondLogsSessionManager.findTrackedSession()).toBeUndefined()
  })
})

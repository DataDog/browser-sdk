import type { RelativeTime } from '@datadog/browser-core'
import {
  STORAGE_POLL_DELAY,
  SESSION_STORE_KEY,
  getCookie,
  setCookie,
  stopSessionManager,
  ONE_SECOND,
  DOM_EVENT,
  relativeNow,
  createTrackingConsentState,
  TrackingConsent,
} from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { createNewEvent, mockClock } from '@datadog/browser-core/test'

import type { LogsConfiguration } from './configuration'
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
    clock.cleanup()
  })

  it('when tracked should store tracking type and session id', () => {
    startLogsSessionManagerWithDefaults()

    expect(getCookie(SESSION_STORE_KEY)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.TRACKED}`)
    expect(getCookie(SESSION_STORE_KEY)).toMatch(/id=[a-f0-9-]+/)
  })

  it('when not tracked should store tracking type', () => {
    startLogsSessionManagerWithDefaults({ configuration: { sessionSampleRate: 0 } })

    expect(getCookie(SESSION_STORE_KEY)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.NOT_TRACKED}`)
    expect(getCookie(SESSION_STORE_KEY)).not.toContain('id=')
  })

  it('when tracked should keep existing tracking type and session id', () => {
    setCookie(SESSION_STORE_KEY, 'id=abcdef&logs=1', DURATION)

    startLogsSessionManagerWithDefaults()

    expect(getCookie(SESSION_STORE_KEY)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.TRACKED}`)
    expect(getCookie(SESSION_STORE_KEY)).toContain('id=abcdef')
  })

  it('when not tracked should keep existing tracking type', () => {
    setCookie(SESSION_STORE_KEY, 'logs=0', DURATION)

    startLogsSessionManagerWithDefaults()

    expect(getCookie(SESSION_STORE_KEY)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.NOT_TRACKED}`)
  })

  it('should renew on activity after expiration', () => {
    startLogsSessionManagerWithDefaults()

    setCookie(SESSION_STORE_KEY, '', DURATION)
    expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()
    clock.tick(STORAGE_POLL_DELAY)

    document.body.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

    expect(getCookie(SESSION_STORE_KEY)).toMatch(/id=[a-f0-9-]+/)
    expect(getCookie(SESSION_STORE_KEY)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.TRACKED}`)
  })

  describe('findTrackedSession', () => {
    it('should return the current active session', () => {
      setCookie(SESSION_STORE_KEY, 'id=abcdef&logs=1', DURATION)
      const logsSessionManager = startLogsSessionManagerWithDefaults()
      expect(logsSessionManager.findTrackedSession()!.id).toBe('abcdef')
    })

    it('should return undefined if the session is not tracked', () => {
      setCookie(SESSION_STORE_KEY, 'id=abcdef&logs=0', DURATION)
      const logsSessionManager = startLogsSessionManagerWithDefaults()
      expect(logsSessionManager.findTrackedSession()).toBeUndefined()
    })

    it('should not return the current session if it has expired by default', () => {
      setCookie(SESSION_STORE_KEY, 'id=abcdef&logs=1', DURATION)
      const logsSessionManager = startLogsSessionManagerWithDefaults()
      clock.tick(10 * ONE_SECOND)
      setCookie(SESSION_STORE_KEY, '', DURATION)
      clock.tick(STORAGE_POLL_DELAY)
      expect(logsSessionManager.findTrackedSession()).toBeUndefined()
    })

    it('should return the current session if it has expired when returnExpired = true', () => {
      const logsSessionManager = startLogsSessionManagerWithDefaults()
      setCookie(SESSION_STORE_KEY, '', DURATION)
      clock.tick(STORAGE_POLL_DELAY)
      expect(logsSessionManager.findTrackedSession(relativeNow(), { returnExpired: true })).toBeDefined()
    })

    it('should return session corresponding to start time', () => {
      setCookie(SESSION_STORE_KEY, 'id=foo&logs=1', DURATION)
      const logsSessionManager = startLogsSessionManagerWithDefaults()
      clock.tick(10 * ONE_SECOND)
      setCookie(SESSION_STORE_KEY, 'id=bar&logs=1', DURATION)
      // simulate a click to renew the session
      document.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      clock.tick(STORAGE_POLL_DELAY)
      expect(logsSessionManager.findTrackedSession(0 as RelativeTime)!.id).toEqual('foo')
      expect(logsSessionManager.findTrackedSession()!.id).toEqual('bar')
    })
  })

  describe('isActiveAt', () => {
    it('should return true when the session is active and false when the session has expired', () => {
      setCookie(SESSION_STORE_KEY, 'id=abcdef&logs=1', DURATION)
      const logsSessionManager = startLogsSessionManagerWithDefaults()
      clock.tick(10 * ONE_SECOND)
      setCookie(SESSION_STORE_KEY, '', DURATION)
      clock.tick(STORAGE_POLL_DELAY)

      const session = logsSessionManager.findTrackedSession(relativeNow(), { returnExpired: true })!
      expect(session.isActiveAt(0 as RelativeTime)).toEqual(true)
      expect(session.isActiveAt((11 * ONE_SECOND) as RelativeTime)).toEqual(false)
    })
  })

  function startLogsSessionManagerWithDefaults({ configuration }: { configuration?: Partial<LogsConfiguration> } = {}) {
    return startLogsSessionManager(
      {
        sessionSampleRate: 100,
        sessionStoreStrategyType: { type: 'Cookie', cookieOptions: {} },
        ...configuration,
      } as LogsConfiguration,
      createTrackingConsentState(TrackingConsent.GRANTED)
    )
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

import type { RelativeTime } from '@datadog/browser-core'
import {
  STORAGE_POLL_DELAY,
  SESSION_STORE_KEY,
  getCookie,
  setCookie,
  stopSessionManager,
  ONE_SECOND,
} from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'

import type { LogsConfiguration } from './configuration'
import {
  LOGS_SESSION_KEY,
  LoggerTrackingType,
  startLogsSessionManager,
  startLogsSessionManagerStub,
} from './logsSessionManager'

describe('logs session manager', () => {
  const DURATION = 123456
  const configuration: Partial<LogsConfiguration> = {
    sessionSampleRate: 0.5,
    sessionStoreStrategyType: { type: 'Cookie', cookieOptions: {} },
  }
  let clock: Clock
  let tracked: boolean

  beforeEach(() => {
    tracked = true
    spyOn(Math, 'random').and.callFake(() => (tracked ? 0 : 1))
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
    tracked = true

    startLogsSessionManager(configuration as LogsConfiguration)

    expect(getCookie(SESSION_STORE_KEY)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.TRACKED}`)
    expect(getCookie(SESSION_STORE_KEY)).toMatch(/id=[a-f0-9-]+/)
  })

  it('when not tracked should store tracking type', () => {
    tracked = false

    startLogsSessionManager(configuration as LogsConfiguration)

    expect(getCookie(SESSION_STORE_KEY)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.NOT_TRACKED}`)
    expect(getCookie(SESSION_STORE_KEY)).not.toContain('id=')
  })

  it('when tracked should keep existing tracking type and session id', () => {
    setCookie(SESSION_STORE_KEY, 'id=abcdef&logs=1', DURATION)

    startLogsSessionManager(configuration as LogsConfiguration)

    expect(getCookie(SESSION_STORE_KEY)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.TRACKED}`)
    expect(getCookie(SESSION_STORE_KEY)).toContain('id=abcdef')
  })

  it('when not tracked should keep existing tracking type', () => {
    setCookie(SESSION_STORE_KEY, 'logs=0', DURATION)

    startLogsSessionManager(configuration as LogsConfiguration)

    expect(getCookie(SESSION_STORE_KEY)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.NOT_TRACKED}`)
  })

  it('should renew on activity after expiration', () => {
    startLogsSessionManager(configuration as LogsConfiguration)

    setCookie(SESSION_STORE_KEY, '', DURATION)
    expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()
    clock.tick(STORAGE_POLL_DELAY)

    tracked = true
    document.body.click()

    expect(getCookie(SESSION_STORE_KEY)).toMatch(/id=[a-f0-9-]+/)
    expect(getCookie(SESSION_STORE_KEY)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.TRACKED}`)
  })

  describe('findSession', () => {
    it('should return the current session', () => {
      setCookie(SESSION_STORE_KEY, 'id=abcdef&logs=1', DURATION)
      const logsSessionManager = startLogsSessionManager(configuration as LogsConfiguration)
      expect(logsSessionManager.findTrackedSession()!.id).toBe('abcdef')
    })

    it('should return undefined if the session is not tracked', () => {
      setCookie(SESSION_STORE_KEY, 'id=abcdef&logs=0', DURATION)
      const logsSessionManager = startLogsSessionManager(configuration as LogsConfiguration)
      expect(logsSessionManager.findTrackedSession()).toBe(undefined)
    })

    it('should return undefined if the session has expired', () => {
      const logsSessionManager = startLogsSessionManager(configuration as LogsConfiguration)
      setCookie(SESSION_STORE_KEY, '', DURATION)
      clock.tick(STORAGE_POLL_DELAY)
      expect(logsSessionManager.findTrackedSession()).toBe(undefined)
    })

    it('should return session corresponding to start time', () => {
      setCookie(SESSION_STORE_KEY, 'id=abcdef&logs=1', DURATION)
      const logsSessionManager = startLogsSessionManager(configuration as LogsConfiguration)
      clock.tick(10 * ONE_SECOND)
      setCookie(SESSION_STORE_KEY, '', DURATION)
      clock.tick(STORAGE_POLL_DELAY)
      expect(logsSessionManager.findTrackedSession()).toBeUndefined()
      expect(logsSessionManager.findTrackedSession(0 as RelativeTime)!.id).toBe('abcdef')
    })
  })
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

import type { RelativeTime } from '@datadog/browser-core'
import {
  COOKIE_ACCESS_DELAY,
  getCookie,
  SESSION_COOKIE_NAME,
  setCookie,
  stopSessionManager,
  ONE_SECOND,
} from '@datadog/browser-core'
import type { Clock } from '../../../core/test/specHelper'
import { mockClock } from '../../../core/test/specHelper'

import type { LogsConfiguration } from './configuration'
import {
  LOGS_SESSION_KEY,
  LoggerTrackingType,
  startLogsSessionManager,
  startLogsSessionManagerStub,
} from './logsSessionManager'

describe('logs session manager', () => {
  const DURATION = 123456
  const configuration: Partial<LogsConfiguration> = { sampleRate: 0.5 }
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

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.TRACKED}`)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]+/)
  })

  it('when not tracked should store tracking type', () => {
    tracked = false

    startLogsSessionManager(configuration as LogsConfiguration)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.NOT_TRACKED}`)
    expect(getCookie(SESSION_COOKIE_NAME)).not.toContain('id=')
  })

  it('when tracked should keep existing tracking type and session id', () => {
    setCookie(SESSION_COOKIE_NAME, 'id=abcdef&logs=1', DURATION)

    startLogsSessionManager(configuration as LogsConfiguration)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.TRACKED}`)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain('id=abcdef')
  })

  it('when not tracked should keep existing tracking type', () => {
    setCookie(SESSION_COOKIE_NAME, 'logs=0', DURATION)

    startLogsSessionManager(configuration as LogsConfiguration)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.NOT_TRACKED}`)
  })

  it('should renew on activity after expiration', () => {
    startLogsSessionManager(configuration as LogsConfiguration)

    setCookie(SESSION_COOKIE_NAME, '', DURATION)
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    clock.tick(COOKIE_ACCESS_DELAY)

    tracked = true
    document.body.click()

    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]+/)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.TRACKED}`)
  })

  describe('findSession', () => {
    it('should return the current session', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&logs=1', DURATION)
      const logsSessionManager = startLogsSessionManager(configuration as LogsConfiguration)
      expect(logsSessionManager.findTrackedSession()!.id).toBe('abcdef')
    })

    it('should return undefined if the session is not tracked', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&logs=0', DURATION)
      const logsSessionManager = startLogsSessionManager(configuration as LogsConfiguration)
      expect(logsSessionManager.findTrackedSession()).toBe(undefined)
    })

    it('should return undefined if the session has expired', () => {
      const logsSessionManager = startLogsSessionManager(configuration as LogsConfiguration)
      setCookie(SESSION_COOKIE_NAME, '', DURATION)
      clock.tick(COOKIE_ACCESS_DELAY)
      expect(logsSessionManager.findTrackedSession()).toBe(undefined)
    })

    it('should return session corresponding to start time', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&logs=1', DURATION)
      const logsSessionManager = startLogsSessionManager(configuration as LogsConfiguration)
      clock.tick(10 * ONE_SECOND)
      setCookie(SESSION_COOKIE_NAME, '', DURATION)
      clock.tick(COOKIE_ACCESS_DELAY)
      expect(logsSessionManager.findTrackedSession()).toBeUndefined()
      expect(logsSessionManager.findTrackedSession(0 as RelativeTime)!.id).toBe('abcdef')
    })
  })
})

describe('logger session stub', () => {
  it('isTracked is computed at each init and getId is always undefined', () => {
    const firstLogsSessionManager = startLogsSessionManagerStub({ sampleRate: 100 } as LogsConfiguration)
    expect(firstLogsSessionManager.findTrackedSession()).toBeDefined()
    expect(firstLogsSessionManager.findTrackedSession()!.id).toBeUndefined()

    const secondLogsSessionManager = startLogsSessionManagerStub({ sampleRate: 0 } as LogsConfiguration)
    expect(secondLogsSessionManager.findTrackedSession()).toBeUndefined()
  })
})

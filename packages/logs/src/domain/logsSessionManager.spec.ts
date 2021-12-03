import {
  Configuration,
  COOKIE_ACCESS_DELAY,
  getCookie,
  SESSION_COOKIE_NAME,
  setCookie,
  stopSessionManagement,
  ONE_SECOND,
  RelativeTime,
} from '@datadog/browser-core'
import { Clock, mockClock } from '../../../core/test/specHelper'

import {
  LOGS_SESSION_KEY,
  LoggerTrackingType,
  startLogsSessionManagement,
  startLogsSessionManagementStub,
} from './logsSessionManager'

describe('logger session', () => {
  const DURATION = 123456
  const configuration: Partial<Configuration> = { sampleRate: 0.5 }
  let clock: Clock
  let tracked: boolean

  beforeEach(() => {
    tracked = true
    spyOn(Math, 'random').and.callFake(() => (tracked ? 0 : 1))
    clock = mockClock()
  })

  afterEach(() => {
    // remove intervals first
    stopSessionManagement()
    // flush pending callbacks to avoid random failures
    clock.tick(new Date().getTime())
    clock.cleanup()
  })

  it('when tracked should store tracking type and session id', () => {
    tracked = true

    startLogsSessionManagement(configuration as Configuration)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.TRACKED}`)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]+/)
  })

  it('when not tracked should store tracking type', () => {
    tracked = false

    startLogsSessionManagement(configuration as Configuration)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.NOT_TRACKED}`)
    expect(getCookie(SESSION_COOKIE_NAME)).not.toContain('id=')
  })

  it('when tracked should keep existing tracking type and session id', () => {
    setCookie(SESSION_COOKIE_NAME, 'id=abcdef&logs=1', DURATION)

    startLogsSessionManagement(configuration as Configuration)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.TRACKED}`)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain('id=abcdef')
  })

  it('when not tracked should keep existing tracking type', () => {
    setCookie(SESSION_COOKIE_NAME, 'logs=0', DURATION)

    startLogsSessionManagement(configuration as Configuration)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.NOT_TRACKED}`)
  })

  it('should renew on activity after expiration', () => {
    startLogsSessionManagement(configuration as Configuration)

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
      const logsSessionManager = startLogsSessionManagement(configuration as Configuration)
      expect(logsSessionManager.findSession()!.id).toBe('abcdef')
    })

    it('should return undefined if the session is not tracked', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&logs=0', DURATION)
      const logsSessionManager = startLogsSessionManagement(configuration as Configuration)
      expect(logsSessionManager.findSession()).toBe(undefined)
    })

    it('should return undefined if the session has expired', () => {
      const logsSessionManager = startLogsSessionManagement(configuration as Configuration)
      setCookie(SESSION_COOKIE_NAME, '', DURATION)
      clock.tick(COOKIE_ACCESS_DELAY)
      expect(logsSessionManager.findSession()).toBe(undefined)
    })

    it('should return session corresponding to start time', () => {
      setCookie(SESSION_COOKIE_NAME, 'id=abcdef&logs=1', DURATION)
      const logsSessionManager = startLogsSessionManagement(configuration as Configuration)
      clock.tick(10 * ONE_SECOND)
      setCookie(SESSION_COOKIE_NAME, '', DURATION)
      clock.tick(COOKIE_ACCESS_DELAY)
      expect(logsSessionManager.findSession()).toBeUndefined()
      expect(logsSessionManager.findSession(0 as RelativeTime)!.id).toBe('abcdef')
    })
  })
})

describe('logger session stub', () => {
  it('isTracked is computed at each init and getId is always undefined', () => {
    const firstLogsSessionManager = startLogsSessionManagementStub({ sampleRate: 100 } as Configuration)
    expect(firstLogsSessionManager.findSession()).toBeDefined()
    expect(firstLogsSessionManager.findSession()!.id).toBeUndefined()

    const secondLogsSessionManager = startLogsSessionManagementStub({ sampleRate: 0 } as Configuration)
    expect(secondLogsSessionManager.findSession()).toBeUndefined()
  })
})

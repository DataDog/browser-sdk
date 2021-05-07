import {
  Configuration,
  COOKIE_ACCESS_DELAY,
  getCookie,
  SESSION_COOKIE_NAME,
  setCookie,
  stopSessionManagement,
} from '@datadog/browser-core'
import { Clock, mockClock } from '../../../core/test/specHelper'

import { LOGGER_SESSION_KEY, LoggerTrackingType, startLoggerSession } from './loggerSession'

describe('logger session', () => {
  const DURATION = 123456
  const configuration: Partial<Configuration> = { isEnabled: () => true, sampleRate: 0.5 }
  let tracked = true
  let clock: Clock

  beforeEach(() => {
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

    startLoggerSession(configuration as Configuration, true)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGGER_SESSION_KEY}=${LoggerTrackingType.TRACKED}`)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]+/)
  })

  it('when not tracked should store tracking type', () => {
    tracked = false

    startLoggerSession(configuration as Configuration, true)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGGER_SESSION_KEY}=${LoggerTrackingType.NOT_TRACKED}`)
    expect(getCookie(SESSION_COOKIE_NAME)).not.toContain('id=')
  })

  it('when tracked should keep existing tracking type and session id', () => {
    setCookie(SESSION_COOKIE_NAME, 'id=abcdef&logs=1', DURATION)

    startLoggerSession(configuration as Configuration, true)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGGER_SESSION_KEY}=${LoggerTrackingType.TRACKED}`)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain('id=abcdef')
  })

  it('when not tracked should keep existing tracking type', () => {
    setCookie(SESSION_COOKIE_NAME, 'logs=0', DURATION)

    startLoggerSession(configuration as Configuration, true)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGGER_SESSION_KEY}=${LoggerTrackingType.NOT_TRACKED}`)
  })

  it('should renew on activity after expiration', () => {
    startLoggerSession(configuration as Configuration, true)

    setCookie(SESSION_COOKIE_NAME, '', DURATION)
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    clock.tick(COOKIE_ACCESS_DELAY)

    tracked = true
    document.body.click()

    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]+/)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGGER_SESSION_KEY}=${LoggerTrackingType.TRACKED}`)
  })

  it('when no cookies available, isTracked is computed at each call and getId is undefined', () => {
    const session = startLoggerSession(configuration as Configuration, false)

    expect(session.getId()).toBeUndefined()
    expect(session.isTracked()).toMatch(/true|false/)
  })
})

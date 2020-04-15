import {
  Configuration,
  COOKIE_ACCESS_DELAY,
  getCookie,
  SESSION_COOKIE_NAME,
  setCookie,
  stopSessionManagement,
} from '@datadog/browser-core'

import { LOGGER_SESSION_KEY, LoggerSessionType, startLoggerSession } from '../src/loggerSession'

describe('logger session', () => {
  const DURATION = 123456
  const configuration: Partial<Configuration> = { isEnabled: () => true, sampleRate: 0.5 }
  let tracked = true

  beforeEach(() => {
    spyOn(Math, 'random').and.callFake(() => (tracked ? 0 : 1))
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date())
  })

  afterEach(() => {
    // remove intervals first
    stopSessionManagement()
    // flush pending callbacks to avoid random failures
    jasmine.clock().tick(new Date().getTime())
    jasmine.clock().uninstall()
  })

  it('when tracked should store session type and id', () => {
    tracked = true

    startLoggerSession(configuration as Configuration, true)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGGER_SESSION_KEY}=${LoggerSessionType.TRACKED}`)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]+/)
  })

  it('when not tracked should store session type', () => {
    tracked = false

    startLoggerSession(configuration as Configuration, true)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGGER_SESSION_KEY}=${LoggerSessionType.NOT_TRACKED}`)
    expect(getCookie(SESSION_COOKIE_NAME)).not.toContain('id=')
  })

  it('when tracked should keep existing session type and id', () => {
    setCookie(SESSION_COOKIE_NAME, 'id=abcdef&logs=1', DURATION)

    startLoggerSession(configuration as Configuration, true)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGGER_SESSION_KEY}=${LoggerSessionType.TRACKED}`)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain('id=abcdef')
  })

  it('when not tracked should keep existing session type', () => {
    setCookie(SESSION_COOKIE_NAME, 'logs=0', DURATION)

    startLoggerSession(configuration as Configuration, true)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGGER_SESSION_KEY}=${LoggerSessionType.NOT_TRACKED}`)
  })

  it('should renew on activity after expiration', () => {
    startLoggerSession(configuration as Configuration, true)

    setCookie(SESSION_COOKIE_NAME, '', DURATION)
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    jasmine.clock().tick(COOKIE_ACCESS_DELAY)

    tracked = true
    document.body.click()

    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]+/)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGGER_SESSION_KEY}=${LoggerSessionType.TRACKED}`)
  })

  it('when no cookies available, isTracked is computed at each call and getId is undefined', () => {
    const session = startLoggerSession(configuration as Configuration, false)

    expect(session.getId()).toBeUndefined()
    expect(session.isTracked()).toMatch(/true|false/)
  })
})

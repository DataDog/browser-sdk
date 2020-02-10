import {
  Configuration,
  COOKIE_ACCESS_DELAY,
  getCookie,
  SESSION_COOKIE_NAME,
  setCookie,
  stopSessionManagement,
} from '@datadog/browser-core'

import { LOGGER_COOKIE_NAME, LoggerSessionType, startLoggerSession } from '../src/loggerSession'

describe('logger session', () => {
  const DURATION = 123456
  const configuration: Partial<Configuration> = { sampleRate: 0.5 }
  let tracked = true

  beforeEach(() => {
    spyOn(Math, 'random').and.callFake(() => (tracked ? 0 : 1))
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date())
  })

  afterEach(() => {
    // flush pending callbacks to avoid random failures
    jasmine.clock().tick(new Date().getTime())
    jasmine.clock().uninstall()
    stopSessionManagement()
  })

  it('when tracked should store session type and id', () => {
    tracked = true

    startLoggerSession(configuration as Configuration, true)

    expect(getCookie(LOGGER_COOKIE_NAME)).toEqual(LoggerSessionType.TRACKED)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)
  })

  it('when not tracked should store session type', () => {
    tracked = false

    startLoggerSession(configuration as Configuration, true)

    expect(getCookie(LOGGER_COOKIE_NAME)).toEqual(LoggerSessionType.NOT_TRACKED)
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
  })

  it('when tracked should keep existing session type and id', () => {
    setCookie(LOGGER_COOKIE_NAME, LoggerSessionType.TRACKED, DURATION)
    setCookie(SESSION_COOKIE_NAME, 'abcdef', DURATION)

    startLoggerSession(configuration as Configuration, true)

    expect(getCookie(LOGGER_COOKIE_NAME)).toEqual(LoggerSessionType.TRACKED)
    expect(getCookie(SESSION_COOKIE_NAME)).toEqual('abcdef')
  })

  it('when not tracked should keep existing session type', () => {
    setCookie(LOGGER_COOKIE_NAME, LoggerSessionType.NOT_TRACKED, DURATION)

    startLoggerSession(configuration as Configuration, true)

    expect(getCookie(LOGGER_COOKIE_NAME)).toEqual(LoggerSessionType.NOT_TRACKED)
  })

  it('should renew on activity after expiration', () => {
    startLoggerSession(configuration as Configuration, true)

    setCookie(LOGGER_COOKIE_NAME, '', DURATION)
    setCookie(SESSION_COOKIE_NAME, '', DURATION)
    expect(getCookie(LOGGER_COOKIE_NAME)).toBeUndefined()
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    jasmine.clock().tick(COOKIE_ACCESS_DELAY)

    tracked = true
    document.body.click()

    expect(getCookie(LOGGER_COOKIE_NAME)).toEqual(LoggerSessionType.TRACKED)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)
  })
})

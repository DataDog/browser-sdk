import { monitor, stopSessionManagement } from '@datadog/browser-core'
import { resetXhrProxy } from '../../core/src/xhrProxy'
import { LogsGlobal } from '../src'
import { makeLogsGlobal } from '../src/logs.entry'

describe('logs entry', () => {
  let logsGlobal: LogsGlobal

  beforeEach(() => {
    logsGlobal = makeLogsGlobal({} as any)
  })

  afterEach(() => {
    // some tests can successfully start the tracking
    // stop behaviors that can pollute following tests
    stopSessionManagement()
    resetXhrProxy()
  })

  it('should set global with init', () => {
    expect(!!logsGlobal).toEqual(true)
    expect(!!logsGlobal.init).toEqual(true)
  })

  it('init should log an error with no public api key', () => {
    const errorSpy = spyOn(console, 'error')

    logsGlobal.init(undefined as any)
    expect(console.error).toHaveBeenCalledTimes(1)

    logsGlobal.init({ stillNoApiKey: true } as any)
    expect(console.error).toHaveBeenCalledTimes(2)

    logsGlobal.init({ clientToken: 'yeah' })
    expect(errorSpy).toHaveBeenCalledTimes(2)
  })

  it('should warn if now deprecated publicApiKey is used', () => {
    spyOn(console, 'warn')

    logsGlobal.init({ publicApiKey: 'yo' } as any)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('should add a `_setDebug` that works', () => {
    const setDebug: (debug: boolean) => void = (logsGlobal as any)._setDebug as any
    expect(!!setDebug).toEqual(true)

    spyOn(console, 'warn')
    monitor(() => {
      throw new Error()
    })()
    expect(console.warn).toHaveBeenCalledTimes(0)

    setDebug(true)
    monitor(() => {
      throw new Error()
    })()
    expect(console.warn).toHaveBeenCalledTimes(1)

    setDebug(false)
  })

  it('init should log an error if sampleRate is invalid', () => {
    const errorSpy = spyOn(console, 'error')
    logsGlobal.init({ clientToken: 'yes', sampleRate: 'foo' as any })
    expect(errorSpy).toHaveBeenCalledTimes(1)

    logsGlobal.init({ clientToken: 'yes', sampleRate: 200 })
    expect(errorSpy).toHaveBeenCalledTimes(2)
  })

  it('should log an error if init is called several times', () => {
    const errorSpy = spyOn(console, 'error')
    logsGlobal.init({ clientToken: 'yes', sampleRate: 1 })
    expect(errorSpy).toHaveBeenCalledTimes(0)

    logsGlobal.init({ clientToken: 'yes', sampleRate: 1 })
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('should not log an error if init is called several times and silentMultipleInit is true', () => {
    const errorSpy = spyOn(console, 'error')
    logsGlobal.init({
      clientToken: 'yes',
      sampleRate: 1,
      silentMultipleInit: true,
    })
    expect(errorSpy).toHaveBeenCalledTimes(0)

    logsGlobal.init({
      clientToken: 'yes',
      sampleRate: 1,
      silentMultipleInit: true,
    })
    expect(errorSpy).toHaveBeenCalledTimes(0)
  })

  it("shouldn't trigger any console.log if the configuration is correct", () => {
    const errorSpy = spyOn(console, 'error')
    logsGlobal.init({ clientToken: 'yes', sampleRate: 1 })
    expect(errorSpy).toHaveBeenCalledTimes(0)
  })

  describe('cookie configuration', () => {
    let cookieSetSpy: jasmine.Spy
    beforeEach(() => {
      // ensure to pass cookie authorized test
      document.cookie = 'dd_cookie_test=test'
      cookieSetSpy = spyOnProperty(document, 'cookie', 'set')
    })

    it('should set cookie on same-site strict by default', () => {
      logsGlobal.init({ clientToken: 'yes' })

      expect(getSessionCookieCall(cookieSetSpy)).toMatch(/^_dd_s=[^;]*;expires=[^;]+;path=\/;samesite=strict$/)
    })

    it('should allow to enforce secure context execution', () => {
      logsGlobal.init({ clientToken: 'yes', enforceSecureContextExecution: true })

      expect(getSessionCookieCall(cookieSetSpy)).toMatch(/^_dd_s=[^;]*;expires=[^;]+;path=\/;samesite=strict;secure$/)
    })

    it('should allow to third party context execution', () => {
      logsGlobal.init({ clientToken: 'yes', allowThirdPartyContextExecution: true })

      expect(getSessionCookieCall(cookieSetSpy)).toMatch(/^_dd_s=[^;]*;expires=[^;]+;path=\/;samesite=none;secure$/)
    })

    it('should allow to track session across subdomains', () => {
      logsGlobal.init({ clientToken: 'yes', trackSessionAcrossSubdomains: true })

      expect(getSessionCookieCall(cookieSetSpy)).toMatch(
        /^_dd_s=[^;]*;expires=[^;]+;path=\/;samesite=strict;domain=.*$/
      )
    })
  })
})

function getSessionCookieCall(cookieSetSpy: jasmine.Spy) {
  return cookieSetSpy.calls.argsFor(cookieSetSpy.calls.count() - 1)[0] as string
}

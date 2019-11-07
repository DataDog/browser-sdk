import { monitor, stopSessionManagement } from '@browser-agent/core'
import { LogsGlobal } from '../src'

describe('logs entry', () => {
  let logsGlobal: LogsGlobal

  beforeEach(() => {
    logsGlobal = require('../src/logs.entry').datadogLogs
    delete (require.cache as any)[require.resolve('../src/logs.entry')]
  })

  afterEach(() => {
    stopSessionManagement()
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

  it("shouldn't trigger any console.log if the configuration is correct", () => {
    const errorSpy = spyOn(console, 'error')
    logsGlobal.init({ clientToken: 'yes', sampleRate: 1 })
    expect(errorSpy).toHaveBeenCalledTimes(0)
  })
})

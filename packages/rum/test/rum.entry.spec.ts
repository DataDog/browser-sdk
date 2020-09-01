import { isIE, stopSessionManagement } from '@datadog/browser-core'
import { resetXhrProxy } from '../../core/src/xhrProxy'

import { makeRumGlobal, RumGlobal, RumUserConfiguration } from '../src/rum.entry'

describe('rum entry', () => {
  let rumGlobal: RumGlobal
  let errorSpy: jasmine.Spy

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    errorSpy = spyOn(console, 'error')
    rumGlobal = makeRumGlobal({} as any)
  })

  afterEach(() => {
    // some tests can successfully start the tracking
    // stop behaviors that can pollute following tests
    stopSessionManagement()
    resetXhrProxy()
  })

  it('init should log an error with no application id', () => {
    const invalidConfiguration = { clientToken: 'yes' }
    rumGlobal.init(invalidConfiguration as RumUserConfiguration)
    expect(console.error).toHaveBeenCalledTimes(1)

    rumGlobal.init({ clientToken: 'yes', applicationId: 'yes' })
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('init should log an error if sampleRate is invalid', () => {
    rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 'foo' as any })
    expect(errorSpy).toHaveBeenCalledTimes(1)

    rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 200 })
    expect(errorSpy).toHaveBeenCalledTimes(2)
  })

  it('init should log an error if resourceSampleRate is invalid', () => {
    rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', resourceSampleRate: 'foo' as any })
    expect(errorSpy).toHaveBeenCalledTimes(1)

    rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', resourceSampleRate: 200 })
    expect(errorSpy).toHaveBeenCalledTimes(2)
  })

  it('should log an error if init is called several times', () => {
    rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
    expect(errorSpy).toHaveBeenCalledTimes(0)

    rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('should log an error if tracing is enabled without a service configured', () => {
    rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', allowedTracingOrigins: [] })
    expect(errorSpy).toHaveBeenCalledTimes(0)

    makeRumGlobal({} as any).init({
      allowedTracingOrigins: ['foo.bar'],
      applicationId: 'yes',
      clientToken: 'yes',
      service: 'foo',
    })
    expect(errorSpy).toHaveBeenCalledTimes(0)

    makeRumGlobal({} as any).init({ clientToken: 'yes', applicationId: 'yes', allowedTracingOrigins: ['foo.bar'] })
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('should not log an error if init is called several times and silentMultipleInit is true', () => {
    rumGlobal.init({
      applicationId: 'yes',
      clientToken: 'yes',
      resourceSampleRate: 1,
      sampleRate: 1,
      silentMultipleInit: true,
    })
    expect(errorSpy).toHaveBeenCalledTimes(0)

    rumGlobal.init({
      applicationId: 'yes',
      clientToken: 'yes',
      resourceSampleRate: 1,
      sampleRate: 1,
      silentMultipleInit: true,
    })
    expect(errorSpy).toHaveBeenCalledTimes(0)
  })

  it("shouldn't trigger any console.log if the configuration is correct", () => {
    rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
    expect(errorSpy).toHaveBeenCalledTimes(0)
  })
})

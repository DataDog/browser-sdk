import { isIE, stopSessionManagement } from '@datadog/browser-core'
import { startXhrProxy } from '../../core/src/xhrProxy'

import { makeRumGlobal, RumGlobal, RumUserConfiguration } from '../src/rum.entry'

describe('rum entry', () => {
  let rumGlobal: RumGlobal

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    rumGlobal = makeRumGlobal({} as any)
  })

  afterEach(() => {
    stopSessionManagement()
    startXhrProxy().reset()
  })

  it('init should log an error with no application id', () => {
    const errorSpy = spyOn(console, 'error')
    const invalidConfiguration = { clientToken: 'yes' }
    rumGlobal.init(invalidConfiguration as RumUserConfiguration)
    expect(console.error).toHaveBeenCalledTimes(1)

    rumGlobal.init({ clientToken: 'yes', applicationId: 'yes' })
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('init should log an error if sampleRate is invalid', () => {
    const errorSpy = spyOn(console, 'error')
    rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 'foo' as any })
    expect(errorSpy).toHaveBeenCalledTimes(1)

    rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 200 })
    expect(errorSpy).toHaveBeenCalledTimes(2)
  })

  it('init should log an error if resourceSampleRate is invalid', () => {
    const errorSpy = spyOn(console, 'error')
    rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', resourceSampleRate: 'foo' as any })
    expect(errorSpy).toHaveBeenCalledTimes(1)

    rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', resourceSampleRate: 200 })
    expect(errorSpy).toHaveBeenCalledTimes(2)
  })

  it('should log an error if init is called several times', () => {
    const errorSpy = spyOn(console, 'error')
    rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
    expect(errorSpy).toHaveBeenCalledTimes(0)

    rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('should not log an error if init is called several times and silentMultipleInit is true', () => {
    const errorSpy = spyOn(console, 'error')
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
    const errorSpy = spyOn(console, 'error')
    rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
    expect(errorSpy).toHaveBeenCalledTimes(0)
  })
})

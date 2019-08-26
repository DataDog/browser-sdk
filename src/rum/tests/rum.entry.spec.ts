import { ALREADY_INITIALIZED_MESSAGE, RumUserConfiguration } from '../rum.entry'

describe('rum entry', () => {
  beforeEach(() => {
    require('../rum.entry')
    spyOn(console, 'warn')
    delete (require.cache as any)[require.resolve('../rum.entry')]
  })

  it('should set global with init', () => {
    expect(!!window.DD_RUM).toEqual(true)
    expect(!!window.DD_RUM.init).toEqual(true)
  })

  it('should warn of multiple call to init', () => {
    window.DD_RUM.init({ clientToken: 'first', applicationId: 'appID' })
    window.DD_RUM.init({ clientToken: 'second', applicationId: 'appID' })
    expect(console.warn).toHaveBeenCalledWith(ALREADY_INITIALIZED_MESSAGE)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('init should log an error with no application id', () => {
    const errorSpy = spyOn(console, 'error')
    const invalidConfiguration = { clientToken: 'yes' }
    window.DD_RUM.init(invalidConfiguration as RumUserConfiguration)
    expect(console.error).toHaveBeenCalledTimes(1)

    window.DD_RUM.init({ clientToken: 'yes', applicationId: 'yes' })
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})

import { RumUserConfiguration } from '../rum.entry'

describe('rum entry', () => {
  beforeEach(() => {
    require('../rum.entry')
    delete (require.cache as any)[require.resolve('../rum.entry')]
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

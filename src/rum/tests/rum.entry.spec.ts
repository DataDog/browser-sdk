import { expect } from 'chai'
import * as sinon from 'sinon'
import { RumUserConfiguration } from '../rum.entry'

describe('rum entry', () => {
  beforeEach(() => {
    require('../rum.entry')
    delete (require.cache as any)[require.resolve('../rum.entry')]
  })

  it('init should log an error with no application id', () => {
    const errorStub = sinon.stub(console, 'error')
    const invalidConfiguration = { clientToken: 'yes' }
    window.DD_RUM.init(invalidConfiguration as RumUserConfiguration)
    expect(errorStub.callCount).equal(1)

    window.DD_RUM.init({ clientToken: 'yes', applicationId: 'yes' })
    expect(errorStub.callCount).equal(1)

    sinon.restore()
  })

  it('should warn if now deprecated publicApiKey is used', () => {
    const warnStub = sinon.stub(console, 'warn')

    window.DD_RUM.init({ publicApiKey: 'yo' } as any)
    expect(warnStub.callCount).equal(1)

    sinon.restore()
  })
})

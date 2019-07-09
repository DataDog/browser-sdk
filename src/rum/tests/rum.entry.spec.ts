import { expect } from 'chai'
import * as sinon from 'sinon'
import { RumUserConfiguration } from '../rum.entry'

describe('rum entry', () => {
  it('init should log an error with no application id', () => {
    require('../rum.entry')

    const errorStub = sinon.stub(console, 'error')
    const warnStub = sinon.stub(console, 'warn')
    const invalidConfiguration = { clientToken: 'yes' }
    window.DD_RUM.init(invalidConfiguration as RumUserConfiguration)
    expect(errorStub.callCount).equal(1)

    window.DD_RUM.init({ clientToken: 'yes', applicationId: 'yes' })
    expect(errorStub.callCount).equal(1)

    window.DD_RUM.init({ publicApiKey: 'yo' } as any)
    expect(warnStub.callCount).equal(1)

    sinon.restore()
  })
})

import { expect } from 'chai'
import * as sinon from 'sinon'

describe('rum entry', () => {
  it('init should log an error with no rum project id', () => {
    require('../rum.entry')

    const errorStub = sinon.stub(console, 'error')
    ;(window.DD_RUM as any).init({ publicApiKey: 'yes' })
    expect(errorStub.callCount).to.eq(1)

    window.DD_RUM.init({ publicApiKey: 'yes', rumProjectId: 'yes' })
    expect(errorStub.callCount).to.eq(1)

    sinon.restore()
  })
})

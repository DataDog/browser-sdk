import { expect, use } from 'chai'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'

import { commonInit, SECOND_INIT_WARNING_MESSAGE } from '../init'

use(sinonChai)

describe('init', () => {
  let warnStub: sinon.SinonStub

  beforeEach(() => {
    warnStub = sinon.stub(console, 'warn')
  })

  afterEach(() => {
    sinon.restore()
  })

  it('should warn of multiple call to init', () => {
    commonInit({ publicApiKey: 'first' })
    commonInit({ publicApiKey: 'second' })
    expect(warnStub.calledOnce).to.be.true
    expect(warnStub).calledWithExactly(SECOND_INIT_WARNING_MESSAGE)
  })
})

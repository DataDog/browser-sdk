import { expect } from 'chai'
import * as sinon from 'sinon'

import { monitor } from '../../core/internalMonitoring'

describe('logs entry', () => {
  beforeEach(() => {
    require('../logs.entry')
    delete require.cache[require.resolve('../logs.entry')]
  })

  it('should set global with init', () => {
    expect(!!window.DD_LOGS).to.be.true
    expect(!!window.DD_LOGS.init).to.be.true
  })

  it('init should log an error with no public api key', () => {
    const errorStub = sinon.stub(console, 'error')

    window.DD_LOGS.init(undefined as any)
    expect(errorStub.callCount).to.eq(1)

    window.DD_LOGS.init({ stillNoApiKey: true } as any)
    expect(errorStub.callCount).to.eq(2)

    window.DD_LOGS.init({ publicApiKey: 'yeah' })
    expect(errorStub.callCount).to.eq(2)

    sinon.restore()
  })

  it('should add a `_setDebug` that works', () => {
    const setDebug = (window.DD_LOGS as any)._setDebug
    expect(!!setDebug).true

    const errorStub = sinon.stub(console, 'warn')
    monitor(() => {
      throw new Error()
    })()
    expect(errorStub.callCount).to.eq(0)

    setDebug(true)
    monitor(() => {
      throw new Error()
    })()
    expect(errorStub.callCount).to.eq(1)

    setDebug(false)
    sinon.restore()
  })

  it('should always keep the same global reference', () => {
    const global = window.DD_LOGS

    global.init({ publicApiKey: 'yeah' })

    expect(window.DD_LOGS).to.eq(global)
  })
})

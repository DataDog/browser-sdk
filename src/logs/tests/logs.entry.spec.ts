import { expect } from 'chai'
import * as sinon from 'sinon'

import { monitor } from '../../core/internalMonitoring'

describe('logs entry', () => {
  beforeEach(() => {
    require('../logs.entry')
    delete (require.cache as any)[require.resolve('../logs.entry')]
  })

  it('should set global with init', () => {
    expect(!!window.DD_LOGS).equal(true)
    expect(!!window.DD_LOGS.init).equal(true)
  })

  it('init should log an error with no public api key', () => {
    const errorStub = sinon.stub(console, 'error')

    window.DD_LOGS.init(undefined as any)
    expect(errorStub.callCount).equal(1)

    window.DD_LOGS.init({ stillNoApiKey: true } as any)
    expect(errorStub.callCount).equal(2)

    window.DD_LOGS.init({ clientToken: 'yeah' })
    expect(errorStub.callCount).equal(2)

    sinon.restore()
  })

  // it('should warn if now deprecated publicApiKey is used', () => {
  //   const warnStub = sinon.stub(console, 'warn')

  //   window.DD_LOGS.init({ publicApiKey: 'yo' } as any)
  //   expect(warnStub.callCount).equal(1)

  //   sinon.restore()
  // })

  it('should add a `_setDebug` that works', () => {
    const setDebug: (debug: boolean) => void = (window.DD_LOGS as any)._setDebug as any
    expect(!!setDebug).true

    const errorStub = sinon.stub(console, 'warn')
    monitor(() => {
      throw new Error()
    })()
    expect(errorStub.callCount).equal(0)

    setDebug(true)
    monitor(() => {
      throw new Error()
    })()
    expect(errorStub.callCount).equal(1)

    setDebug(false)
    sinon.restore()
  })

  it('should always keep the same global reference', () => {
    const global = window.DD_LOGS

    global.init({ clientToken: 'yeah' })

    expect(window.DD_LOGS).equal(global)
  })
})

import { expect, use } from 'chai'
import * as sinon from 'sinon'
import * as sinonChai from 'sinon-chai'

import { isAndroid } from '../../tests/specHelper'
import { computeStackTrace } from '../../tracekit/tracekit'

import {
  ErrorMessage,
  formatStackTraceToContext,
  startConsoleTracking,
  startRuntimeErrorTracking,
  stopConsoleTracking,
  stopRuntimeErrorTracking,
} from '../errorCollection'

use(sinonChai)

describe('console tracker', () => {
  let consoleErrorStub: sinon.SinonStub
  let notifyError: any
  beforeEach(() => {
    consoleErrorStub = sinon.stub(console, 'error')
    consoleErrorStub.returnsThis()
    notifyError = sinon.spy()
    startConsoleTracking(notifyError)
  })

  afterEach(() => {
    stopConsoleTracking()
    sinon.restore()
  })

  it('should keep original behavior', () => {
    console.error('foo', 'bar')
    expect(consoleErrorStub).to.have.been.calledWithExactly('foo', 'bar')
  })

  it('should log error', () => {
    console.error('foo', 'bar')
    expect(notifyError).to.have.been.calledWithExactly({ message: 'foo bar' })
  })
})

describe('runtime error tracker', () => {
  const ERROR_MESSAGE = 'foo'
  let mochaHandler: ErrorEventHandler
  let notifyError: sinon.SinonSpy
  let onerrorSpy: sinon.SinonSpy

  beforeEach(function() {
    if (isAndroid()) {
      this.skip()
    }
    mochaHandler = window.onerror
    onerrorSpy = sinon.spy(() => ({}))
    window.onerror = onerrorSpy

    notifyError = sinon.spy()
    // ensure that we call mocha handler for unexpected errors
    const notifyErrorProxy = (e: ErrorMessage) =>
      e.message !== ERROR_MESSAGE ? mochaHandler(e.message) : notifyError(e)
    startRuntimeErrorTracking(notifyErrorProxy)
  })

  afterEach(() => {
    stopRuntimeErrorTracking()
    sinon.restore()
    window.onerror = mochaHandler
  })

  it('should log error', (done) => {
    setTimeout(() => {
      throw new Error(ERROR_MESSAGE)
    }, 10)

    setTimeout(() => {
      expect(notifyError.getCall(0).args[0].message).to.equal(ERROR_MESSAGE)
      done()
    }, 100)
  })

  it('should call original error handler', (done) => {
    setTimeout(() => {
      throw new Error(ERROR_MESSAGE)
    }, 10)

    setTimeout(() => {
      expect(onerrorSpy).to.have.been.calledWithMatch(sinon.match(ERROR_MESSAGE))
      done()
    }, 100)
  })

  it('should format the error with right context', () => {
    const error = new Error('abcd')
    const context = formatStackTraceToContext(computeStackTrace(error))
    expect(!!context.error).true
    expect(!!context.error.stack).true
    expect(context.error.kind).eq('Error')
  })
})

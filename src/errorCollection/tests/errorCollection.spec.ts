import { expect, use } from 'chai'
import * as sinon from 'sinon'
import * as sinonChai from 'sinon-chai'

import { isAndroid } from '../../tests/specHelper'
import { computeStackTrace } from '../../tracekit/tracekit'

import {
  formatStackTraceToContext,
  startConsoleTracking,
  startRuntimeErrorTracking,
  stopConsoleTracking,
  stopRuntimeErrorTracking,
} from '../errorCollection'

use(sinonChai)

describe('console tracker', () => {
  let consoleErrorStub: sinon.SinonStub
  let logger: any
  beforeEach(() => {
    logger = {
      error: () => ({}),
    }
    consoleErrorStub = sinon.stub(console, 'error')
    consoleErrorStub.returnsThis()
    sinon.spy(logger, 'error')
    startConsoleTracking(logger)
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
    expect(logger.error).to.have.been.calledWithExactly('foo bar')
  })
})

describe('runtime error tracker', () => {
  const ERROR_MESSAGE = 'foo'
  let mochaHandler: ErrorEventHandler
  let logger: any
  let onerrorSpy: sinon.SinonSpy

  beforeEach(function() {
    if (isAndroid()) {
      this.skip()
    }
    mochaHandler = window.onerror
    onerrorSpy = sinon.spy(() => ({}))
    window.onerror = onerrorSpy

    logger = {
      // ensure that we call mocha handler for unexpected errors
      error: (message: string) => (message !== ERROR_MESSAGE ? mochaHandler(message) : undefined),
    }
    sinon.spy(logger, 'error')
    startRuntimeErrorTracking(logger)
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
      expect(logger.error).to.have.been.calledWith(ERROR_MESSAGE)
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

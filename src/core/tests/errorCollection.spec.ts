import { expect, use } from 'chai'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'

import { isAndroid } from '../../tests/specHelper'
import { StackTrace } from '../../tracekit/tracekit'
import {
  ErrorMessage,
  formatStackTraceToContext,
  startConsoleTracking,
  startRuntimeErrorTracking,
  stopConsoleTracking,
  stopRuntimeErrorTracking,
} from '../errorCollection'
import { Observable } from '../observable'

use(sinonChai)

describe('console tracker', () => {
  let consoleErrorStub: sinon.SinonStub
  let notifyError: sinon.SinonSpy

  beforeEach(() => {
    consoleErrorStub = sinon.stub(console, 'error')
    consoleErrorStub.returnsThis()
    notifyError = sinon.spy()
    const errorObservable = new Observable<ErrorMessage>()
    errorObservable.subscribe(notifyError)
    startConsoleTracking(errorObservable)
  })

  afterEach(() => {
    stopConsoleTracking()
    sinon.restore()
  })

  it('should keep original behavior', () => {
    console.error('foo', 'bar')
    expect(consoleErrorStub).to.have.been.calledWithExactly('foo', 'bar')
  })

  it('should notify error', () => {
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
    const errorObservable = new Observable<ErrorMessage>()
    // ensure that we call mocha handler for unexpected errors
    errorObservable.subscribe((e: ErrorMessage) =>
      e.message !== ERROR_MESSAGE ? mochaHandler(e.message) : notifyError(e)
    )

    startRuntimeErrorTracking(errorObservable)
  })

  afterEach(() => {
    stopRuntimeErrorTracking()
    sinon.restore()
    window.onerror = mochaHandler
  })

  it('should notify error', (done) => {
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
    const stack: StackTrace = {
      message: 'oh snap!',
      name: 'TypeError',
      stack: [
        {
          args: ['1', 'bar'],
          column: 15,
          func: 'foo',
          line: 52,
          url: 'http://path/to/file.js',
        },
        {
          args: [],
          column: undefined,
          func: '?',
          line: 12,
          url: 'http://path/to/file.js',
        },
        {
          args: ['baz'],
          column: undefined,
          func: '?',
          line: undefined,
          url: 'http://path/to/file.js',
        },
      ],
    }

    const context = formatStackTraceToContext(stack)

    expect(context.error.kind).eq('TypeError')
    expect(context.error.stack).eq(`TypeError: oh snap!
  at foo(1, bar) @ http://path/to/file.js:52:15
  at <anonymous> @ http://path/to/file.js:12
  at <anonymous>(baz) @ http://path/to/file.js`)
  })
})

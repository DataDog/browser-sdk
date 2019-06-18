import { expect, use } from 'chai'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'

import { isAndroid } from '../../tests/specHelper'
import { StackTrace } from '../../tracekit/tracekit'
import { Configuration } from '../configuration'
import {
  ErrorMessage,
  ErrorOrigin,
  filterErrors,
  formatRuntimeError,
  startConsoleTracking,
  startRuntimeErrorTracking,
  stopConsoleTracking,
  stopRuntimeErrorTracking,
  trackNetworkError,
} from '../errorCollection'
import { Observable } from '../observable'
import { RequestDetails, RequestType } from '../requestCollection'
import { noop, ONE_MINUTE, ResourceType } from '../utils'

use(sinonChai)

describe('console tracker', () => {
  let consoleErrorStub: sinon.SinonStub
  let notifyError: sinon.SinonSpy
  const CONSOLE_CONTEXT = {
    context: {
      error: {
        origin: ErrorOrigin.CONSOLE,
      },
    },
  }

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
    expect(consoleErrorStub).calledWithExactly('foo', 'bar')
  })

  it('should notify error', () => {
    console.error('foo', 'bar')
    expect(notifyError).calledWithExactly({ ...CONSOLE_CONTEXT, message: 'console error: foo bar' })
  })

  it('should stringify object parameters', () => {
    console.error('Hello', { foo: 'bar' })
    expect(notifyError).calledWithExactly({ ...CONSOLE_CONTEXT, message: 'console error: Hello {\n  "foo": "bar"\n}' })
  })

  it('should format error instance', () => {
    console.error(new TypeError('hello'))
    expect((notifyError.getCall(0).args[0] as ErrorMessage).message).equal('console error: TypeError: hello')
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
    onerrorSpy = sinon.spy(noop)
    window.onerror = onerrorSpy

    notifyError = sinon.spy()
    const errorObservable = new Observable<ErrorMessage>()
    // ensure that we call mocha handler for unexpected errors
    errorObservable.subscribe((e: ErrorMessage) =>
      e.message !== ERROR_MESSAGE ? mochaHandler(e.message) : (notifyError(e) as void)
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
      expect((notifyError.getCall(0).args[0] as ErrorMessage).message).equal(ERROR_MESSAGE)
      done()
    }, 100)
  })

  it('should call original error handler', (done) => {
    setTimeout(() => {
      throw new Error(ERROR_MESSAGE)
    }, 10)

    setTimeout(() => {
      expect(onerrorSpy).calledWithMatch(sinon.match(ERROR_MESSAGE))
      done()
    }, 100)
  })
})

describe('runtime error formatter', () => {
  const NOT_COMPUTED_STACK_TRACE: StackTrace = { name: undefined, message: undefined, stack: [] } as any

  it('should format an error', () => {
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

    const formatted = formatRuntimeError(stack, undefined)

    expect(formatted.message).equal('oh snap!')
    expect(formatted.context.error.kind).equal('TypeError')
    expect(formatted.context.error.origin).equal('source')
    expect(formatted.context.error.stack).equal(`TypeError: oh snap!
  at foo(1, bar) @ http://path/to/file.js:52:15
  at <anonymous> @ http://path/to/file.js:12
  at <anonymous>(baz) @ http://path/to/file.js`)
  })

  it('should format an error with an empty message', () => {
    const stack: StackTrace = {
      message: '',
      name: 'TypeError',
      stack: [],
    }

    const formatted = formatRuntimeError(stack, undefined)

    expect(formatted.message).equal('Empty message')
  })

  it('should format a string error', () => {
    const errorObject = 'oh snap!'

    const formatted = formatRuntimeError(NOT_COMPUTED_STACK_TRACE, errorObject)

    expect(formatted.message).equal('Uncaught "oh snap!"')
  })

  it('should format an object error', () => {
    const errorObject = { foo: 'bar' }

    const formatted = formatRuntimeError(NOT_COMPUTED_STACK_TRACE, errorObject)

    expect(formatted.message).equal('Uncaught {"foo":"bar"}')
  })
})

describe('network error tracker', () => {
  let errorObservableSpy: sinon.SinonSpy
  let requestObservable: Observable<RequestDetails>
  const DEFAULT_REQUEST = {
    duration: 10,
    method: 'GET',
    response: 'Server error',
    startTime: 0,
    status: 503,
    type: RequestType.XHR,
    url: 'http://fake.com',
  }

  beforeEach(() => {
    const errorObservable = new Observable<ErrorMessage>()
    requestObservable = new Observable<RequestDetails>()
    errorObservableSpy = sinon.spy(errorObservable, 'notify')
    const configuration = { requestErrorResponseLengthLimit: 32 }
    trackNetworkError(configuration as Configuration, errorObservable, requestObservable)
  })

  it('should track server error', () => {
    requestObservable.notify(DEFAULT_REQUEST)

    expect(errorObservableSpy).calledWith({
      context: {
        error: { origin: 'network', stack: 'Server error' },
        http: { method: 'GET', status_code: 503, url: 'http://fake.com' },
      },
      message: 'XHR error GET http://fake.com',
    })
  })

  it('should track refused request', () => {
    requestObservable.notify({ ...DEFAULT_REQUEST, status: 0 })
    expect(errorObservableSpy.called).equal(true)
  })

  it('should not track client error', () => {
    requestObservable.notify({ ...DEFAULT_REQUEST, status: 400 })
    expect(errorObservableSpy.called).equal(false)
  })

  it('should not track successful request', () => {
    requestObservable.notify({ ...DEFAULT_REQUEST, status: 200 })
    expect(errorObservableSpy.called).equal(false)
  })

  it('should add a default error response', () => {
    requestObservable.notify({ ...DEFAULT_REQUEST, response: undefined })

    const stack = (errorObservableSpy.getCall(0).args[0] as ErrorMessage).context.error.stack
    expect(stack).equal('Failed to load')
  })

  it('should truncate error response', () => {
    requestObservable.notify({ ...DEFAULT_REQUEST, response: 'Lorem ipsum dolor sit amet orci aliquam.' })

    const stack = (errorObservableSpy.getCall(0).args[0] as ErrorMessage).context.error.stack
    expect(stack).equal('Lorem ipsum dolor sit amet orci ...')
  })
})

describe('error limitation', () => {
  let errorObservable: Observable<ErrorMessage>
  let filteredSubscriber: sinon.SinonSpy
  let clock: sinon.SinonFakeTimers
  const CONTEXT = {
    context: {
      error: {
        origin: ErrorOrigin.SOURCE,
      },
    },
  }

  beforeEach(() => {
    errorObservable = new Observable<ErrorMessage>()
    const configuration: Partial<Configuration> = { maxErrorsByMinute: 2 }
    clock = sinon.useFakeTimers()
    const filteredErrorObservable = filterErrors(configuration as Configuration, errorObservable)
    filteredSubscriber = sinon.spy()
    filteredErrorObservable.subscribe(filteredSubscriber)
  })

  afterEach(() => {
    clock.restore()
  })

  it('should stop send errors if threshold is exceeded', () => {
    errorObservable.notify({ message: '1', ...CONTEXT })
    errorObservable.notify({ message: '2', ...CONTEXT })
    errorObservable.notify({ message: '3', ...CONTEXT })

    expect(filteredSubscriber).calledWith({ message: '1', ...CONTEXT })
    expect(filteredSubscriber).calledWith({ message: '2', ...CONTEXT })
    expect(filteredSubscriber).not.calledWith({ message: '3', ...CONTEXT })
  })

  it('should send a threshold reached message', () => {
    errorObservable.notify({ message: '1', ...CONTEXT })
    errorObservable.notify({ message: '2', ...CONTEXT })
    errorObservable.notify({ message: '3', ...CONTEXT })

    expect(filteredSubscriber).calledWith({
      context: { error: { origin: ErrorOrigin.AGENT } },
      message: 'Reached max number of errors by minute: 2',
    })
  })

  it('should reset error count every each minute', () => {
    errorObservable.notify({ message: '1', ...CONTEXT })
    errorObservable.notify({ message: '2', ...CONTEXT })
    errorObservable.notify({ message: '3', ...CONTEXT })
    errorObservable.notify({ message: '4', ...CONTEXT })
    expect(filteredSubscriber.callCount).equal(3)

    clock.tick(ONE_MINUTE - 1)

    errorObservable.notify({ message: '5', ...CONTEXT })
    expect(filteredSubscriber.callCount).equal(3)

    clock.tick(1)

    errorObservable.notify({ message: '6', ...CONTEXT })
    errorObservable.notify({ message: '7', ...CONTEXT })
    errorObservable.notify({ message: '8', ...CONTEXT })
    errorObservable.notify({ message: '9', ...CONTEXT })
    expect(filteredSubscriber.callCount).equal(6)

    clock.tick(ONE_MINUTE)

    errorObservable.notify({ message: '10', ...CONTEXT })
    expect(filteredSubscriber.callCount).equal(7)
  })
})

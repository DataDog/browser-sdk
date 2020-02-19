import { Configuration } from '../src/configuration'
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
} from '../src/errorCollection'
import { Observable } from '../src/observable'
import { RequestDetails, RequestType } from '../src/requestCollection'
import { StackTrace } from '../src/tracekit'
import { ONE_MINUTE } from '../src/utils'

describe('console tracker', () => {
  let consoleErrorStub: jasmine.Spy
  let notifyError: jasmine.Spy
  const CONSOLE_CONTEXT = {
    context: {
      error: {
        origin: ErrorOrigin.CONSOLE,
      },
    },
  }

  beforeEach(() => {
    consoleErrorStub = spyOn(console, 'error')
    notifyError = jasmine.createSpy()
    const errorObservable = new Observable<ErrorMessage>()
    errorObservable.subscribe(notifyError)
    startConsoleTracking(errorObservable)
  })

  afterEach(() => {
    stopConsoleTracking()
  })

  it('should keep original behavior', () => {
    console.error('foo', 'bar')
    expect(consoleErrorStub).toHaveBeenCalledWith('foo', 'bar')
  })

  it('should notify error', () => {
    console.error('foo', 'bar')
    expect(notifyError).toHaveBeenCalledWith({
      ...CONSOLE_CONTEXT,
      message: 'console error: foo bar',
      startTime: jasmine.any(Number),
    })
  })

  it('should stringify object parameters', () => {
    console.error('Hello', { foo: 'bar' })
    expect(notifyError).toHaveBeenCalledWith({
      ...CONSOLE_CONTEXT,
      message: 'console error: Hello {\n  "foo": "bar"\n}',
      startTime: jasmine.any(Number),
    })
  })

  it('should format error instance', () => {
    console.error(new TypeError('hello'))
    expect((notifyError.calls.mostRecent().args[0] as ErrorMessage).message).toContain(
      'console error: TypeError: hello'
    )
  })
})

describe('runtime error tracker', () => {
  const ERROR_MESSAGE = 'foo'
  let originalHandler: OnErrorEventHandler
  let notifyError: jasmine.Spy
  let onerrorSpy: jasmine.Spy

  beforeEach(() => {
    originalHandler = window.onerror
    onerrorSpy = jasmine.createSpy()
    window.onerror = onerrorSpy

    notifyError = jasmine.createSpy()
    const errorObservable = new Observable<ErrorMessage>()
    errorObservable.subscribe((e: ErrorMessage) => notifyError(e) as void)

    startRuntimeErrorTracking(errorObservable)
  })

  afterEach(() => {
    stopRuntimeErrorTracking()
    window.onerror = originalHandler
  })

  it('should call original error handler', (done) => {
    setTimeout(() => {
      throw new Error(ERROR_MESSAGE)
    }, 10)

    setTimeout(() => {
      expect(onerrorSpy.calls.mostRecent().args[0]).toMatch(ERROR_MESSAGE)
      done()
    }, 100)
  })

  it('should notify error', (done) => {
    setTimeout(() => {
      throw new Error(ERROR_MESSAGE)
    }, 10)

    setTimeout(() => {
      expect((notifyError.calls.mostRecent().args[0] as ErrorMessage).message).toEqual(ERROR_MESSAGE)
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

    expect(formatted.message).toEqual('oh snap!')
    expect(formatted.context.error.kind).toEqual('TypeError')
    expect(formatted.context.error.origin).toEqual('source')
    expect(formatted.context.error.stack).toEqual(`TypeError: oh snap!
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

    expect(formatted.message).toEqual('Empty message')
  })

  it('should format a string error', () => {
    const errorObject = 'oh snap!'

    const formatted = formatRuntimeError(NOT_COMPUTED_STACK_TRACE, errorObject)

    expect(formatted.message).toEqual('Uncaught "oh snap!"')
  })

  it('should format an object error', () => {
    const errorObject = { foo: 'bar' }

    const formatted = formatRuntimeError(NOT_COMPUTED_STACK_TRACE, errorObject)

    expect(formatted.message).toEqual('Uncaught {"foo":"bar"}')
  })
})

describe('network error tracker', () => {
  let errorObservableSpy: jasmine.Spy
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
    errorObservableSpy = spyOn(errorObservable, 'notify')
    const configuration = { requestErrorResponseLengthLimit: 32 }
    trackNetworkError(configuration as Configuration, errorObservable, requestObservable)
  })

  it('should track server error', () => {
    requestObservable.notify(DEFAULT_REQUEST)

    expect(errorObservableSpy).toHaveBeenCalledWith({
      context: {
        error: { origin: 'network', stack: 'Server error' },
        http: { method: 'GET', status_code: 503, url: 'http://fake.com' },
      },
      message: 'XHR error GET http://fake.com',
      startTime: jasmine.any(Number),
    })
  })

  it('should track refused request', () => {
    requestObservable.notify({ ...DEFAULT_REQUEST, status: 0 })
    expect(errorObservableSpy).toHaveBeenCalled()
  })

  it('should not track client error', () => {
    requestObservable.notify({ ...DEFAULT_REQUEST, status: 400 })
    expect(errorObservableSpy).not.toHaveBeenCalled()
  })

  it('should not track successful request', () => {
    requestObservable.notify({ ...DEFAULT_REQUEST, status: 200 })
    expect(errorObservableSpy).not.toHaveBeenCalled()
  })

  it('should add a default error response', () => {
    requestObservable.notify({ ...DEFAULT_REQUEST, response: undefined })

    const stack = (errorObservableSpy.calls.mostRecent().args[0] as ErrorMessage).context.error.stack
    expect(stack).toEqual('Failed to load')
  })

  it('should truncate error response', () => {
    requestObservable.notify({ ...DEFAULT_REQUEST, response: 'Lorem ipsum dolor sit amet orci aliquam.' })

    const stack = (errorObservableSpy.calls.mostRecent().args[0] as ErrorMessage).context.error.stack
    expect(stack).toEqual('Lorem ipsum dolor sit amet orci ...')
  })
})

describe('error limitation', () => {
  let errorObservable: Observable<ErrorMessage>
  let filteredSubscriber: jasmine.Spy
  const CONTEXT = {
    context: {
      error: {
        origin: ErrorOrigin.SOURCE,
      },
    },
    startTime: 100,
  }

  beforeEach(() => {
    errorObservable = new Observable<ErrorMessage>()
    const configuration: Partial<Configuration> = { maxErrorsByMinute: 2 }
    jasmine.clock().install()
    const filteredErrorObservable = filterErrors(configuration as Configuration, errorObservable)
    filteredSubscriber = jasmine.createSpy()
    filteredErrorObservable.subscribe(filteredSubscriber)
  })

  afterEach(() => {
    jasmine.clock().uninstall()
  })

  it('should stop send errors if threshold is exceeded', () => {
    errorObservable.notify({ message: '1', ...CONTEXT })
    errorObservable.notify({ message: '2', ...CONTEXT })
    errorObservable.notify({ message: '3', ...CONTEXT })

    expect(filteredSubscriber).toHaveBeenCalledWith({ message: '1', ...CONTEXT })
    expect(filteredSubscriber).toHaveBeenCalledWith({ message: '2', ...CONTEXT })
    expect(filteredSubscriber).not.toHaveBeenCalledWith({ message: '3', ...CONTEXT })
  })

  it('should send a threshold reached message', () => {
    errorObservable.notify({ message: '1', ...CONTEXT })
    errorObservable.notify({ message: '2', ...CONTEXT })
    errorObservable.notify({ message: '3', ...CONTEXT })

    expect(filteredSubscriber).toHaveBeenCalledWith({
      context: { error: { origin: ErrorOrigin.AGENT } },
      message: 'Reached max number of errors by minute: 2',
      startTime: jasmine.any(Number),
    })
  })

  it('should reset error count every each minute', () => {
    errorObservable.notify({ message: '1', ...CONTEXT })
    errorObservable.notify({ message: '2', ...CONTEXT })
    errorObservable.notify({ message: '3', ...CONTEXT })
    errorObservable.notify({ message: '4', ...CONTEXT })
    expect(filteredSubscriber).toHaveBeenCalledTimes(3)

    jasmine.clock().tick(ONE_MINUTE - 1)

    errorObservable.notify({ message: '5', ...CONTEXT })
    expect(filteredSubscriber).toHaveBeenCalledTimes(3)

    jasmine.clock().tick(1)

    errorObservable.notify({ message: '6', ...CONTEXT })
    errorObservable.notify({ message: '7', ...CONTEXT })
    errorObservable.notify({ message: '8', ...CONTEXT })
    errorObservable.notify({ message: '9', ...CONTEXT })
    expect(filteredSubscriber).toHaveBeenCalledTimes(6)

    jasmine.clock().tick(ONE_MINUTE)

    errorObservable.notify({ message: '10', ...CONTEXT })
    expect(filteredSubscriber).toHaveBeenCalledTimes(7)
  })
})

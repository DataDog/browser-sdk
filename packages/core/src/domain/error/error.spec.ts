import { clocksNow } from '../../tools/utils/timeUtils'
import type { StackTrace } from '../../tools/stackTrace/computeStackTrace'
import { registerCleanupTask } from '../../../test'
import { computeRawError, getFileFromStackTraceString, flattenErrorCauses, isError } from './error'
import type { RawErrorCause, ErrorWithCause } from './error.types'
import { ErrorHandling, ErrorSource, NonErrorPrefix } from './error.types'

describe('computeRawError', () => {
  const ERROR_INSTANCE = new TypeError('oh snap!')
  const DEFAULT_STACK = [
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
  ]
  const NOT_COMPUTED_STACK_TRACE: StackTrace = { name: undefined, message: undefined, stack: [] } as any
  const DEFAULT_RAW_ERROR_PARAMS = {
    startClocks: clocksNow(),
    nonErrorPrefix: NonErrorPrefix.UNCAUGHT,
    source: ErrorSource.CUSTOM,
  }

  describe('when stackTrace', () => {
    describe('from an error instance', () => {
      it('should format', () => {
        const stackTrace: StackTrace = {
          message: 'oh snap!',
          name: 'TypeError',
          stack: DEFAULT_STACK,
        }

        const formatted = computeRawError({
          ...DEFAULT_RAW_ERROR_PARAMS,
          stackTrace,
          originalError: ERROR_INSTANCE,
          handling: ErrorHandling.HANDLED,
        })

        expect(formatted.message).toEqual('oh snap!')
        expect(formatted.type).toEqual('TypeError')
        expect(formatted.stack).toEqual(`TypeError: oh snap!
  at foo(1, bar) @ http://path/to/file.js:52:15
  at <anonymous> @ http://path/to/file.js:12
  at <anonymous>(baz) @ http://path/to/file.js`)
      })

      it('should format with an empty message', () => {
        const stackTrace: StackTrace = {
          message: '',
          name: 'TypeError',
          stack: DEFAULT_STACK,
        }

        const formatted = computeRawError({
          ...DEFAULT_RAW_ERROR_PARAMS,
          stackTrace,
          originalError: ERROR_INSTANCE,
          handling: ErrorHandling.HANDLED,
        })

        expect(formatted.message).toEqual('Empty message')
      })
    })

    describe('from a string', () => {
      it('should format with stack message', () => {
        const error = 'Uncaught ReferenceError: foo is undefined'
        const stackTrace = {
          name: 'ReferenceError',
          message: 'foo is undefined',
          stack: [{ url: undefined, line: undefined, column: undefined }],
        }

        const formatted = computeRawError({
          ...DEFAULT_RAW_ERROR_PARAMS,
          stackTrace,
          originalError: error,
          handling: ErrorHandling.HANDLED,
        })

        expect(formatted.type).toEqual('ReferenceError')
        expect(formatted.message).toEqual('foo is undefined')
      })

      it('should format without stack message', () => {
        const error = 'oh snap!'

        const formatted = computeRawError({
          ...DEFAULT_RAW_ERROR_PARAMS,
          stackTrace: NOT_COMPUTED_STACK_TRACE,
          originalError: error,
          handling: ErrorHandling.HANDLED,
        })

        expect(formatted.message).toEqual('Uncaught "oh snap!"')
      })
    })

    it('should format an object error', () => {
      const error = { foo: 'bar' }

      const formatted = computeRawError({
        ...DEFAULT_RAW_ERROR_PARAMS,
        stackTrace: NOT_COMPUTED_STACK_TRACE,
        originalError: error,
        handling: ErrorHandling.HANDLED,
      })

      expect(formatted.message).toEqual('Uncaught {"foo":"bar"}')
    })
  })

  describe('when no stackTrace', () => {
    it('should format a string', () => {
      const error = 'foo is undefined'

      const formatted = computeRawError({
        ...DEFAULT_RAW_ERROR_PARAMS,
        originalError: error,
        handling: ErrorHandling.HANDLED,
      })

      expect(formatted.message).toEqual('Uncaught "foo is undefined"')
    })

    it('should format an object', () => {
      const error = { foo: 'bar' }

      const formatted = computeRawError({
        ...DEFAULT_RAW_ERROR_PARAMS,
        originalError: error,
        handling: ErrorHandling.HANDLED,
      })

      expect(formatted.message).toEqual('Uncaught {"foo":"bar"}')
    })
  })

  it('should set handling according to given parameter', () => {
    const error = { foo: 'bar' }

    expect(
      computeRawError({
        ...DEFAULT_RAW_ERROR_PARAMS,
        stackTrace: NOT_COMPUTED_STACK_TRACE,
        originalError: error,
        handling: ErrorHandling.HANDLED,
      }).handling
    ).toEqual(ErrorHandling.HANDLED)

    expect(
      computeRawError({
        ...DEFAULT_RAW_ERROR_PARAMS,
        stackTrace: NOT_COMPUTED_STACK_TRACE,
        originalError: error,
        handling: ErrorHandling.UNHANDLED,
      }).handling
    ).toEqual(ErrorHandling.UNHANDLED)
  })

  it('should compute an object error with causes', () => {
    const stackTrace: StackTrace = {
      message: 'some typeError message',
      name: 'TypeError',
      stack: [
        {
          url: '<fake url>',
          line: 1,
          column: 2,
        },
      ],
    }

    const error = new Error('foo: bar') as ErrorWithCause
    error.stack = 'Error: foo: bar\n    at <anonymous>:1:15'

    const nestedError = new Error('biz: buz') as ErrorWithCause
    nestedError.stack = 'NestedError: biz: buz\n    at <anonymous>:2:15'

    const deepNestedError = new TypeError('fiz: buz') as ErrorWithCause
    deepNestedError.stack = 'NestedError: fiz: buz\n    at <anonymous>:3:15'

    error.cause = nestedError
    nestedError.cause = deepNestedError

    const formatted = computeRawError({
      ...DEFAULT_RAW_ERROR_PARAMS,
      stackTrace,
      originalError: error,
      handling: ErrorHandling.HANDLED,
      source: ErrorSource.SOURCE,
    })

    expect(formatted?.type).toEqual('TypeError')
    expect(formatted?.message).toEqual('some typeError message')
    expect(formatted.causes?.length).toBe(2)
    expect(formatted.stack).toContain('TypeError: some typeError message')

    const causes = formatted.causes as RawErrorCause[]

    expect(causes[0].message).toContain(nestedError.message)
    expect(causes[0].source).toContain(ErrorSource.SOURCE)
    expect(causes[0].type).toEqual(nestedError.name)
    expect(causes[0].stack).toContain('Error: biz: buz')

    expect(causes[1].message).toContain(deepNestedError.message)
    expect(causes[1].source).toContain(ErrorSource.SOURCE)
    expect(causes[1].type).toEqual(deepNestedError.name)
    expect(causes[1].stack).toContain('Error: fiz: buz')
  })

  it('should propagate the original error without modifications', () => {
    const error = { description: 'syntax error' }
    const stackTrace: StackTrace = {
      message: 'some syntax message',
      name: 'SyntaxError',
      stack: [],
    }

    const formattedWithoutStackTrace = computeRawError({
      ...DEFAULT_RAW_ERROR_PARAMS,
      stackTrace: NOT_COMPUTED_STACK_TRACE,
      originalError: error,
      handling: ErrorHandling.HANDLED,
    })

    const formattedWithStackTrace = computeRawError({
      ...DEFAULT_RAW_ERROR_PARAMS,
      stackTrace,
      originalError: error,
      handling: ErrorHandling.HANDLED,
    })

    expect(formattedWithStackTrace.originalError).toBe(error)
    expect(formattedWithoutStackTrace.originalError).toBe(error)
  })
})

describe('getFileFromStackTraceString', () => {
  it('should get the first source file of the stack', () => {
    expect(
      getFileFromStackTraceString(`TypeError: oh snap!
  at foo(1, bar) @ http://path/to/file.js:52:15
  at <anonymous> @ http://path/to/file.js:12
  at <anonymous>(baz) @ http://path/to/file.js`)
    ).toEqual('http://path/to/file.js:52:15')
  })

  it('should get undefined if no source file is in the stack', () => {
    expect(getFileFromStackTraceString('TypeError: oh snap!')).not.toBeDefined()
  })
})

describe('flattenErrorCauses', () => {
  it('should return undefined if no cause found', () => {
    const error = new Error('foo') as ErrorWithCause
    const errorCauses = flattenErrorCauses(error, ErrorSource.LOGGER)
    expect(errorCauses).toEqual(undefined)
  })

  it('should return undefined if cause is not of type Error', () => {
    const error = new Error('foo') as ErrorWithCause
    const nestedError = { biz: 'buz', cause: new Error('boo') } as unknown as Error

    error.cause = nestedError

    const errorCauses = flattenErrorCauses(error, ErrorSource.LOGGER)
    expect(errorCauses?.length).toEqual(undefined)
  })

  it('should use error to extract stack trace', () => {
    const error = new Error('foo') as ErrorWithCause

    error.cause = new Error('bar')

    const errorCauses = flattenErrorCauses(error, ErrorSource.LOGGER)
    expect(errorCauses?.[0].type).toEqual('Error')
  })

  it('should only return the first 10 errors if nested chain is longer', () => {
    const error = new Error('foo') as ErrorWithCause
    error.cause = error
    const errorCauses = flattenErrorCauses(error, ErrorSource.LOGGER)
    expect(errorCauses?.length).toEqual(10)
  })
})

describe('isError', () => {
  it('should correctly identify an error object from a different window context', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    registerCleanupTask(() => document.body.removeChild(iframe))

    const iframeWindow = iframe.contentWindow as Window & { Error: ErrorConstructor }

    expect(isError(new iframeWindow.Error())).toBe(true)
  })
})

describe('tryToGetContext', () => {
  it('should extract dd_context from an error object', () => {
    const context = { key: 'value' }
    const error = new Error('Test error') as any
    error.dd_context = context

    const rawError = computeRawError({
      stackTrace: undefined,
      originalError: error,
      handlingStack: undefined,
      componentStack: undefined,
      startClocks: clocksNow(),
      nonErrorPrefix: NonErrorPrefix.UNCAUGHT,
      source: ErrorSource.CUSTOM,
      handling: ErrorHandling.HANDLED,
    })

    expect(rawError.context).toEqual(context)
  })
})

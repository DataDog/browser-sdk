import type { StackTrace } from '../domain/tracekit'
import type { RawErrorCause, ErrorWithCause } from './error'
import { clocksNow } from './timeUtils'
import {
  createHandlingStack,
  computeRawError,
  getFileFromStackTraceString,
  flattenErrorCauses,
  ErrorSource,
  ErrorHandling,
} from './error'

describe('computeRawError', () => {
  const NOT_COMPUTED_STACK_TRACE: StackTrace = { name: undefined, message: undefined, stack: [] } as any
  const DEFAULT_RAW_ERROR_PARMS = {
    startClocks: clocksNow(),
    nonErrorPrefix: 'Uncaught',
    source: ErrorSource.CUSTOM,
  }

  it('should format an error', () => {
    const stackTrace: StackTrace = {
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

    const formatted = computeRawError({
      ...DEFAULT_RAW_ERROR_PARMS,
      stackTrace,
      originalError: undefined,
      handling: ErrorHandling.HANDLED,
    })

    expect(formatted.message).toEqual('oh snap!')
    expect(formatted.type).toEqual('TypeError')
    expect(formatted.stack).toEqual(`TypeError: oh snap!
  at foo(1, bar) @ http://path/to/file.js:52:15
  at <anonymous> @ http://path/to/file.js:12
  at <anonymous>(baz) @ http://path/to/file.js`)
  })

  it('should format an error with an empty message', () => {
    const stackTrace: StackTrace = {
      message: '',
      name: 'TypeError',
      stack: [],
    }

    const formatted = computeRawError({
      ...DEFAULT_RAW_ERROR_PARMS,
      stackTrace,
      originalError: undefined,
      handling: ErrorHandling.HANDLED,
    })

    expect(formatted.message).toEqual('Empty message')
  })

  it('should format a string error', () => {
    const error = 'oh snap!'

    const formatted = computeRawError({
      ...DEFAULT_RAW_ERROR_PARMS,
      stackTrace: NOT_COMPUTED_STACK_TRACE,
      originalError: error,
      handling: ErrorHandling.HANDLED,
    })

    expect(formatted.message).toEqual('Uncaught "oh snap!"')
  })

  it('should format an object error', () => {
    const error = { foo: 'bar' }

    const formatted = computeRawError({
      ...DEFAULT_RAW_ERROR_PARMS,
      stackTrace: NOT_COMPUTED_STACK_TRACE,
      originalError: error,
      handling: ErrorHandling.HANDLED,
    })

    expect(formatted.message).toEqual('Uncaught {"foo":"bar"}')
  })

  it('should set handling according to given parameter', () => {
    const error = { foo: 'bar' }

    expect(
      computeRawError({
        ...DEFAULT_RAW_ERROR_PARMS,
        stackTrace: NOT_COMPUTED_STACK_TRACE,
        originalError: error,
        handling: ErrorHandling.HANDLED,
      }).handling
    ).toEqual(ErrorHandling.HANDLED)

    expect(
      computeRawError({
        ...DEFAULT_RAW_ERROR_PARMS,
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
      stack: [],
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
      ...DEFAULT_RAW_ERROR_PARMS,
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

describe('createHandlingStack', () => {
  let handlingStack: string
  function internalCall() {
    handlingStack = createHandlingStack()
  }
  function userCallTwo() {
    internalCall()
  }
  function userCallOne() {
    userCallTwo()
  }

  it('should create handling stack trace without internal calls', () => {
    userCallOne()

    expect(handlingStack).toMatch(`Error: 
  at userCallTwo @ (.*)
  at userCallOne @ (.*)`)
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

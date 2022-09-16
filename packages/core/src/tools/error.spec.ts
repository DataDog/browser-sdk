import type { StackTrace } from '../domain/tracekit'
import type { ErrorCause, RawError } from './error'
import {
  createHandlingStack,
  formatUnknownError,
  getFileFromStackTraceString,
  flattenErrorCauses,
  ErrorSource,
} from './error'

describe('formatUnknownError', () => {
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

    const formatted = formatUnknownError({
      stackTrace: stack,
      errorObject: undefined,
      nonErrorPrefix: 'Uncaught',
      source: 'custom',
    })

    expect(formatted.message).toEqual('oh snap!')
    expect(formatted.type).toEqual('TypeError')
    expect(formatted.stack).toEqual(`TypeError: oh snap!
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

    const formatted = formatUnknownError({
      stackTrace: stack,
      errorObject: undefined,
      nonErrorPrefix: 'Uncaught',
      source: 'custom',
    })

    expect(formatted.message).toEqual('Empty message')
  })

  it('should format a string error', () => {
    const errorObject = 'oh snap!'

    const formatted = formatUnknownError({
      stackTrace: NOT_COMPUTED_STACK_TRACE,
      errorObject,
      nonErrorPrefix: 'Uncaught',
      source: 'custom',
    })

    expect(formatted.message).toEqual('Uncaught "oh snap!"')
  })

  it('should format an object error', () => {
    const errorObject = { foo: 'bar' }

    const formatted = formatUnknownError({
      stackTrace: NOT_COMPUTED_STACK_TRACE,
      errorObject,
      nonErrorPrefix: 'Uncaught',
      source: 'custom',
    })

    expect(formatted.message).toEqual('Uncaught {"foo":"bar"}')
  })

  it('should format an object error with cause', () => {
    const errorObject = new Error('foo: bar')
    const nestedErrorObject = new Error('biz: buz') as unknown as ErrorCause
    const deepNestedErrorObject = new Error('fiz: buz')

    // Add source to only the nested Error
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: source
    deepNestedErrorObject.source = ErrorSource.LOGGER

    // Chain the cause of each error
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: cause
    errorObject.cause = nestedErrorObject
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: cause
    nestedErrorObject.cause = deepNestedErrorObject

    const formatted = formatUnknownError({
      stackTrace: NOT_COMPUTED_STACK_TRACE,
      errorObject,
      nonErrorPrefix: 'Uncaught',
      source: ErrorSource.SOURCE,
    })

    expect(formatted.causes?.length).toBe(2)
    const causes = formatted.causes as ErrorCause[]
    expect(causes[0].message).toContain(nestedErrorObject.message)
    expect(causes[0].source).toContain(ErrorSource.SOURCE)
    expect(causes[1].message).toContain(deepNestedErrorObject.message)
    expect(causes[1].source).toContain(ErrorSource.LOGGER)
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
  it('should return empty array if  no cause found', () => {
    const error = new Error('foo') as unknown as RawError
    const errorCauses = flattenErrorCauses(error, ErrorSource.LOGGER)
    expect(errorCauses.length).toEqual(0)
  })

  it('should only return the first 10 errors if nested chain is longer', () => {
    const error = new Error('foo') as unknown as RawError
    error.cause = error
    const errorCauses = flattenErrorCauses(error, ErrorSource.LOGGER)
    expect(errorCauses.length).toEqual(10)
  })

  it('should use the parent source if not found on error', () => {
    const error1 = new Error('foo') as unknown as RawError
    const error2 = new Error('bar') as unknown as RawError
    const error3 = new Error('biz') as unknown as RawError

    error3.source = ErrorSource.SOURCE

    error1.cause = error2
    error2.cause = error3

    const errorCauses = flattenErrorCauses(error1, ErrorSource.LOGGER)
    expect(errorCauses[0].source).toEqual(ErrorSource.LOGGER)
    expect(errorCauses[1].source).toEqual(ErrorSource.SOURCE)
  })
})

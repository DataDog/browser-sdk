import { describe, expect, it } from 'vitest'
import { clocksNow } from '@datadog/js-core/time'
import type { StackTrace } from '../../tools/stackTrace/computeStackTrace'
import { mockSourceCodeContext, registerCleanupTask } from '../../../test'
import { computeRawError, getFileFromStackTraceString, isError, NO_ERROR_STACK_PRESENT_MESSAGE } from './error'
import type { RawErrorCause, ErrorWithCause } from './error.types'
import { ErrorHandling, ErrorSource, NonErrorPrefix } from './error.types'

describe('computeRawError', () => {
  const DEFAULT_RAW_ERROR_PARAMS = {
    startClocks: clocksNow(),
    nonErrorPrefix: NonErrorPrefix.UNCAUGHT,
    source: ErrorSource.CUSTOM,
  }

  it('should format an error instance', () => {
    const error = new TypeError('oh snap!')
    // This stack was generated in Chrome.
    error.stack = `TypeError: Oh snap!
  at foo (http://path/to/file.js:52:15)
  at <anonymous>:3:1`

    const formatted = computeRawError({
      ...DEFAULT_RAW_ERROR_PARAMS,
      originalError: error,
      handling: ErrorHandling.HANDLED,
    })

    expect(formatted.message).toEqual('oh snap!')
    expect(formatted.type).toEqual('TypeError')
    expect(formatted.stack).toEqual(`TypeError: oh snap!
  at foo @ http://path/to/file.js:52:15
  at <anonymous> @ <anonymous>:3:1`)
  })

  it('should format an error instance with an empty message', () => {
    const error = new TypeError('oh snap!')
    error.message = ''

    const formatted = computeRawError({
      ...DEFAULT_RAW_ERROR_PARAMS,
      originalError: error,
      handling: ErrorHandling.HANDLED,
    })

    expect(formatted.message).toEqual('Empty message')
  })

  it('should format a string error', () => {
    const error = 'oh snap!'

    const formatted = computeRawError({
      ...DEFAULT_RAW_ERROR_PARAMS,
      originalError: error,
      handling: ErrorHandling.HANDLED,
    })

    expect(formatted.message).toEqual('Uncaught "oh snap!"')
    expect(formatted.stack).toEqual(NO_ERROR_STACK_PRESENT_MESSAGE)
  })

  it('should format an object error', () => {
    const error = { foo: 'bar' }

    const formatted = computeRawError({
      ...DEFAULT_RAW_ERROR_PARAMS,
      originalError: error,
      handling: ErrorHandling.HANDLED,
    })

    expect(formatted.message).toEqual('Uncaught {"foo":"bar"}')
    expect(formatted.stack).toEqual(NO_ERROR_STACK_PRESENT_MESSAGE)
  })

  it('should not define the stack if useFallbackStack is false', () => {
    const error = 'foo is undefined'

    const formatted = computeRawError({
      ...DEFAULT_RAW_ERROR_PARAMS,
      originalError: error,
      handling: ErrorHandling.HANDLED,
      useFallbackStack: false,
    })

    expect(formatted.stack).toEqual(undefined)
  })

  it('should use the provided stack trace object', () => {
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
      ...DEFAULT_RAW_ERROR_PARAMS,
      originalError: 'toto',
      handling: ErrorHandling.HANDLED,
      stackTrace,
    })

    expect(formatted.message).toEqual('oh snap!')
    expect(formatted.stack).toEqual(`TypeError: oh snap!
  at foo(1, bar) @ http://path/to/file.js:52:15
  at <anonymous> @ http://path/to/file.js:12
  at <anonymous>(baz) @ http://path/to/file.js`)
    expect(formatted.type).toEqual('TypeError')
  })

  it('should set handling according to given parameter', () => {
    const error = { foo: 'bar' }

    expect(
      computeRawError({
        ...DEFAULT_RAW_ERROR_PARAMS,
        originalError: error,
        handling: ErrorHandling.HANDLED,
      }).handling
    ).toEqual(ErrorHandling.HANDLED)

    expect(
      computeRawError({
        ...DEFAULT_RAW_ERROR_PARAMS,
        originalError: error,
        handling: ErrorHandling.UNHANDLED,
      }).handling
    ).toEqual(ErrorHandling.UNHANDLED)
  })

  it('should attach debug IDs for stack frame URLs present in the source code context', () => {
    const url = 'http://path/to/debug-id.js'
    mockSourceCodeContext({ [`Error: ctx\n    at fn (${url}:1:1)`]: { service: 'svc', ddDebugId: 'debug-id-1' } })

    const error = new Error('oh snap!')
    error.stack = `Error: oh snap!\n    at foo (${url}:52:15)`

    const formatted = computeRawError({
      ...DEFAULT_RAW_ERROR_PARAMS,
      originalError: error,
      handling: ErrorHandling.HANDLED,
    })

    expect(formatted.debugIds).toEqual([{ url, id: 'debug-id-1' }])
  })

  it('should not attach debug IDs when the error has no stack', () => {
    const formatted = computeRawError({
      ...DEFAULT_RAW_ERROR_PARAMS,
      originalError: 'oh snap!',
      handling: ErrorHandling.HANDLED,
    })

    expect(formatted.debugIds).toBeUndefined()
  })

  it('should propagate the original error without modifications', () => {
    const error = { description: 'syntax error' }

    const formattedWithoutStackTrace = computeRawError({
      ...DEFAULT_RAW_ERROR_PARAMS,
      originalError: error,
      handling: ErrorHandling.HANDLED,
    })

    const formattedWithStackTrace = computeRawError({
      ...DEFAULT_RAW_ERROR_PARAMS,
      originalError: error,
      handling: ErrorHandling.HANDLED,
    })

    expect(formattedWithStackTrace.originalError).toBe(error)
    expect(formattedWithoutStackTrace.originalError).toBe(error)
  })

  describe('causes', () => {
    it('should compute an object error with causes', () => {
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
        originalError: error,
        handling: ErrorHandling.HANDLED,
        source: ErrorSource.SOURCE,
      })

      expect(formatted.type).toEqual('Error')
      expect(formatted.message).toEqual('foo: bar')
      expect(formatted.causes!.length).toBe(2)
      expect(formatted.stack).toContain('Error: foo: bar')

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

    it('should attach debug IDs for stack frame URLs coming from a cause in another bundle', () => {
      const url = 'http://path/to/debug-id.js'
      const causeUrl = 'http://path/to/cause-bundle.js'
      mockSourceCodeContext({
        [`Error: ctx\n    at fn (${url}:1:1)`]: { ddDebugId: 'debug-id-1' },
        [`Error: ctx\n    at fn (${causeUrl}:1:1)`]: { ddDebugId: 'debug-id-cause' },
      })

      const cause = new Error('root cause')
      cause.stack = `Error: root cause\n    at bar (${causeUrl}:11:7)`
      const error = new Error('oh snap!') as ErrorWithCause
      error.stack = `Error: oh snap!\n    at foo (${url}:52:15)`
      error.cause = cause

      const formatted = computeRawError({
        ...DEFAULT_RAW_ERROR_PARAMS,
        originalError: error,
        handling: ErrorHandling.HANDLED,
      })

      expect(formatted.debugIds).toEqual([
        { url, id: 'debug-id-1' },
        { url: causeUrl, id: 'debug-id-cause' },
      ])
    })

    it('should return undefined causes when error has no cause', () => {
      const error = new Error('main')
      const formatted = computeRawError({
        ...DEFAULT_RAW_ERROR_PARAMS,
        originalError: error,
        handling: ErrorHandling.HANDLED,
      })
      expect(formatted.causes).toBeUndefined()
    })

    it('should cap causes at 10 for a circular reference', () => {
      const error = new Error('foo') as ErrorWithCause
      error.cause = error
      const formatted = computeRawError({
        ...DEFAULT_RAW_ERROR_PARAMS,
        originalError: error,
        handling: ErrorHandling.HANDLED,
      })
      expect(formatted.causes?.length).toBe(10)
    })

    it('should handle string cause', () => {
      const error = new Error('main') as ErrorWithCause
      error.cause = 'string cause'
      const formatted = computeRawError({
        ...DEFAULT_RAW_ERROR_PARAMS,
        originalError: error,
        handling: ErrorHandling.HANDLED,
      })
      expect(formatted.causes?.length).toBe(1)
      expect(formatted.causes?.[0]).toEqual({
        message: '"string cause"',
        source: ErrorSource.CUSTOM,
        type: undefined,
        stack: undefined,
      })
    })

    it('should handle object cause', () => {
      const error = new Error('main') as ErrorWithCause
      error.cause = { code: 'ERR_001', details: 'Invalid input' }
      const formatted = computeRawError({
        ...DEFAULT_RAW_ERROR_PARAMS,
        originalError: error,
        handling: ErrorHandling.HANDLED,
      })
      expect(formatted.causes?.length).toBe(1)
      expect(formatted.causes?.[0]).toEqual({
        message: '{"code":"ERR_001","details":"Invalid input"}',
        source: ErrorSource.CUSTOM,
        type: undefined,
        stack: undefined,
      })
    })

    it('should handle number cause', () => {
      const error = new Error('main') as ErrorWithCause
      error.cause = 42
      const formatted = computeRawError({
        ...DEFAULT_RAW_ERROR_PARAMS,
        originalError: error,
        handling: ErrorHandling.HANDLED,
      })
      expect(formatted.causes?.length).toBe(1)
      expect(formatted.causes?.[0]).toEqual({
        message: '42',
        source: ErrorSource.CUSTOM,
        type: undefined,
        stack: undefined,
      })
    })

    it('should handle mixed Error and non-Error cause chain', () => {
      const error1 = new Error('first') as ErrorWithCause
      const error2 = new Error('second') as ErrorWithCause
      error1.cause = error2
      error2.cause = { code: 'ERR_ROOT' }
      const formatted = computeRawError({
        ...DEFAULT_RAW_ERROR_PARAMS,
        originalError: error1,
        handling: ErrorHandling.HANDLED,
      })
      expect(formatted.causes?.length).toBe(2)
      expect(formatted.causes?.[0].message).toBe('second')
      expect(formatted.causes?.[0].type).toBe('Error')
      expect(formatted.causes?.[0].stack).toContain('Error')
      expect(formatted.causes?.[1]).toEqual({
        message: '{"code":"ERR_ROOT"}',
        source: ErrorSource.CUSTOM,
        type: undefined,
        stack: undefined,
      })
    })

    it('should stop chain after non-Error cause', () => {
      const error = new Error('main') as ErrorWithCause
      error.cause = { value: 'data', cause: new Error('ignored') }
      const formatted = computeRawError({
        ...DEFAULT_RAW_ERROR_PARAMS,
        originalError: error,
        handling: ErrorHandling.HANDLED,
      })
      expect(formatted.causes?.length).toBe(1)
      expect(formatted.causes?.[0].message).toContain('"value":"data"')
      expect(formatted.causes?.[0].type).toBeUndefined()
    })

    it('should handle null cause', () => {
      const error = new Error('main') as ErrorWithCause
      error.cause = null
      const formatted = computeRawError({
        ...DEFAULT_RAW_ERROR_PARAMS,
        originalError: error,
        handling: ErrorHandling.HANDLED,
      })
      expect(formatted.causes).toBeUndefined()
    })

    it('should handle undefined cause', () => {
      const error = new Error('main') as ErrorWithCause
      error.cause = undefined
      const formatted = computeRawError({
        ...DEFAULT_RAW_ERROR_PARAMS,
        originalError: error,
        handling: ErrorHandling.HANDLED,
      })
      expect(formatted.causes).toBeUndefined()
    })
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

describe('isError', () => {
  it('should correctly identify an error object from a different window context', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    registerCleanupTask(() => document.body.removeChild(iframe))

    const iframeWindow = iframe.contentWindow as Window & { Error: ErrorConstructor }

    expect(isError(new iframeWindow.Error())).toBe(true)
  })

  it('should identify Error-like values', () => {
    expect(isError({ [Symbol.toStringTag]: 'Error' })).toBe(true)
  })

  it('should return false when object tag lookup throws', () => {
    expect(
      isError({
        get [Symbol.toStringTag]() {
          throw new Error('Cannot get tag')
        },
      })
    ).toBe(false)
  })
})

describe('tryToGetContext', () => {
  it('should extract dd_context from an error object', () => {
    const context = { key: 'value' }
    const error = new Error('Test error') as any
    error.dd_context = context

    const rawError = computeRawError({
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

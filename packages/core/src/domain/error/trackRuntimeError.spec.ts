import { disableJasmineUncaughtExceptionTracking, collectAsyncCalls } from '../../../test'
import { Observable } from '../../tools/observable'
import { isIE } from '../../tools/utils/browserDetection'
import type { UnhandledErrorCallback } from './trackRuntimeError'
import { instrumentOnError, instrumentUnhandledRejection, trackRuntimeError } from './trackRuntimeError'
import type { RawError } from './error.types'

describe('trackRuntimeError', () => {
  const ERROR_MESSAGE = 'foo'

  let originalOnErrorHandler: OnErrorEventHandler
  let onErrorSpy: jasmine.Spy

  let originalOnUnhandledRejectionHandler: Window['onunhandledrejection']
  let onUnhandledrejectionSpy: jasmine.Spy

  let notifyError: jasmine.Spy
  let stopRuntimeErrorTracking: () => void

  beforeEach(() => {
    originalOnErrorHandler = window.onerror
    onErrorSpy = jasmine.createSpy()
    window.onerror = onErrorSpy

    originalOnUnhandledRejectionHandler = window.onunhandledrejection
    onUnhandledrejectionSpy = jasmine.createSpy()
    window.onunhandledrejection = onUnhandledrejectionSpy

    notifyError = jasmine.createSpy()
    const errorObservable = new Observable<RawError>()
    errorObservable.subscribe((e: RawError) => notifyError(e) as void)
    ;({ stop: stopRuntimeErrorTracking } = trackRuntimeError(errorObservable))
  })

  afterEach(() => {
    stopRuntimeErrorTracking()
    window.onerror = originalOnErrorHandler
    window.onunhandledrejection = originalOnUnhandledRejectionHandler
  })

  it('should collect unhandled error', (done) => {
    setTimeout(() => {
      throw new Error(ERROR_MESSAGE)
    })
    collectAsyncCalls(onErrorSpy, 1, () => {
      expect(notifyError).toHaveBeenCalledOnceWith(jasmine.objectContaining({ message: ERROR_MESSAGE }))
      done()
    })
  })

  it('should collect unhandled rejection', (done) => {
    if (isIE()) {
      pending('no promise support')
    }
    disableJasmineUncaughtExceptionTracking()

    setTimeout(() => {
      void Promise.reject(new Error(ERROR_MESSAGE))
    })

    collectAsyncCalls(onUnhandledrejectionSpy, 1, () => {
      expect(notifyError).toHaveBeenCalledOnceWith(jasmine.objectContaining({ message: ERROR_MESSAGE }))
      done()
    })
  })
})

describe('instrumentOnError', () => {
  const testLineNo = 1337
  const testColNo = 42
  const ERROR_MESSAGE = 'foo'

  let onErrorSpy: jasmine.Spy
  let callbackSpy: jasmine.Spy<UnhandledErrorCallback>
  let stopCollectingUnhandledError: () => void
  let originalOnErrorHandler: OnErrorEventHandler

  beforeEach(() => {
    originalOnErrorHandler = window.onerror
    onErrorSpy = jasmine.createSpy()
    window.onerror = onErrorSpy
    callbackSpy = jasmine.createSpy()
    ;({ stop: stopCollectingUnhandledError } = instrumentOnError(callbackSpy))
  })

  afterEach(() => {
    window.onerror = originalOnErrorHandler
    stopCollectingUnhandledError()
  })

  it('should call original error handler', (done) => {
    setTimeout(() => {
      throw new Error(ERROR_MESSAGE)
    })
    collectAsyncCalls(onErrorSpy, 1, () => {
      expect(onErrorSpy).toHaveBeenCalled()
      done()
    })
  })

  it('should notify unhandled error instance', (done) => {
    const error = new Error(ERROR_MESSAGE)
    setTimeout(() => {
      throw error
    })
    collectAsyncCalls(onErrorSpy, 1, () => {
      const [stack, originalError] = callbackSpy.calls.mostRecent().args
      expect(originalError).toBe(error)
      expect(stack).toBeDefined()
      done()
    })
  })

  it('should notify unhandled string', (done) => {
    const error = 'foo' as any
    setTimeout(() => {
      // eslint-disable-next-line no-throw-literal
      throw error
    })
    collectAsyncCalls(onErrorSpy, 1, () => {
      const [stack, originalError] = callbackSpy.calls.mostRecent().args
      expect(originalError).toBe(error)
      expect(stack).toBeDefined()
      done()
    })
  })

  it('should notify unhandled object', (done) => {
    const error = { a: 'foo' } as any
    setTimeout(() => {
      // eslint-disable-next-line no-throw-literal
      throw error
    })
    collectAsyncCalls(onErrorSpy, 1, () => {
      const [stack, originalError] = callbackSpy.calls.mostRecent().args
      expect(originalError).toBe(error)
      expect(stack).toBeDefined()
      done()
    })
  })

  describe('uncaught exception handling', () => {
    it('should not go into an infinite loop', (done) => {
      setTimeout(() => {
        throw new Error('expected error')
      })

      setTimeout(() => {
        expect(callbackSpy).toHaveBeenCalledTimes(1)
        done()
      }, 1000)
    })

    it('should get extra arguments (isWindowError and exception)', (done) => {
      const exception = new Error('expected error')

      setTimeout(() => {
        throw exception
      })

      setTimeout(() => {
        expect(callbackSpy).toHaveBeenCalledTimes(1)

        const [, reportedError] = callbackSpy.calls.mostRecent().args
        expect(reportedError).toEqual(exception)

        done()
      }, 1000)
    })
  })

  describe('should handle direct onerror calls', () => {
    it('with objects', (done) => {
      const error = { foo: 'bar' } as any
      setTimeout(() => {
        window.onerror!(error)
      })

      collectAsyncCalls(onErrorSpy, 1, () => {
        const [stack, originalError] = callbackSpy.calls.mostRecent().args
        expect(originalError).toBe(error)
        expect(stack).toBeDefined()
        done()
      })
    })

    describe('with undefined arguments', () => {
      it('should pass undefined:undefined', () => {
        // this is probably not good behavior;  just writing this test to verify
        // that it doesn't change unintentionally
        window.onerror!(undefined!, undefined, testLineNo)
        const [stack] = callbackSpy.calls.mostRecent().args
        expect(stack.name).toBeUndefined()
        expect(stack.message).toBeUndefined()
      })
    })

    describe('when no 5th argument (error object)', () => {
      it('should separate name, message for default error types (e.g. ReferenceError)', () => {
        window.onerror!('ReferenceError: foo is undefined', 'http://example.com', testLineNo)
        const [stack] = callbackSpy.calls.mostRecent().args
        expect(stack.name).toEqual('ReferenceError')
        expect(stack.message).toEqual('foo is undefined')
      })

      it('should separate name, message for default error types (e.g. Uncaught ReferenceError)', () => {
        // should work with/without 'Uncaught'
        window.onerror!('Uncaught ReferenceError: foo is undefined', 'http://example.com', testLineNo)
        const [stack] = callbackSpy.calls.mostRecent().args
        expect(stack.name).toEqual('ReferenceError')
        expect(stack.message).toEqual('foo is undefined')
      })

      it('should separate name, message for default error types on Opera Mini', () => {
        window.onerror!('Uncaught exception: ReferenceError: Undefined variable: foo', 'http://example.com', testLineNo)
        const [stack] = callbackSpy.calls.mostRecent().args
        expect(stack.name).toEqual('ReferenceError')
        expect(stack.message).toEqual('Undefined variable: foo')
      })

      it('should separate name, message for error with multiline message', () => {
        window.onerror!("TypeError: foo is not a function. (In 'my.function(\n foo)")
        const [stack] = callbackSpy.calls.mostRecent().args
        expect(stack.message).toEqual("foo is not a function. (In 'my.function(\n foo)")
        expect(stack.name).toEqual('TypeError')
      })

      it('should ignore unknown error types', () => {
        window.onerror!('CustomError: woo scary', 'http://example.com', testLineNo)
        // TODO: should we attempt to parse this?
        const [stack] = callbackSpy.calls.mostRecent().args
        expect(stack.name).toEqual(undefined)
        expect(stack.message).toEqual('CustomError: woo scary')
      })

      it('should ignore arbitrary messages passed through onerror', () => {
        window.onerror!('all work and no play makes homer: something something', 'http://example.com', testLineNo)
        const [stack] = callbackSpy.calls.mostRecent().args
        expect(stack.name).toEqual(undefined)
        expect(stack.message).toEqual('all work and no play makes homer: something something')
      })

      it('should handle object message passed through onerror', () => {
        window.onerror!({ foo: 'bar' } as any)
        const [stack, error] = callbackSpy.calls.mostRecent().args
        expect(stack.message).toBeUndefined()
        expect(error).toEqual({ foo: 'bar' }) // consider the message as initial error
      })
    })

    describe('when 5th argument (errorObj) is not of type Error', () => {
      it('should handle strings', () => {
        window.onerror!(
          'Any error message',
          'https://example.com',
          testLineNo,
          testColNo,
          'Actual Error Message' as any
        )
        const [stack, error] = callbackSpy.calls.mostRecent().args
        expect(stack.message).toBe('Any error message')
        expect(stack.stack).toEqual([{ url: 'https://example.com', column: testColNo, line: testLineNo }])
        expect(error).toEqual('Actual Error Message')
      })

      it('should handle objects', () => {
        window.onerror!('Any error message', 'https://example.com', testLineNo, testColNo, {
          message: 'SyntaxError',
          data: 'foo',
        } as any)
        const [stack, error] = callbackSpy.calls.mostRecent().args
        expect(stack.message).toBe('Any error message')
        expect(stack.stack).toEqual([{ url: 'https://example.com', column: testColNo, line: testLineNo }])
        expect(error).toEqual({ message: 'SyntaxError', data: 'foo' })
      })
    })
  })
})

describe('instrumentUnhandledRejection', () => {
  let originalOnUnhandledRejectionHandler: Window['onunhandledrejection']
  let onUnhandledrejectionSpy: jasmine.Spy
  let stopCollectingUnhandledError: () => void
  let callbackSpy: jasmine.Spy<UnhandledErrorCallback>
  const ERROR_MESSAGE = 'foo'

  beforeEach(() => {
    callbackSpy = jasmine.createSpy()
    originalOnUnhandledRejectionHandler = window.onunhandledrejection
    onUnhandledrejectionSpy = jasmine.createSpy()
    window.onunhandledrejection = onUnhandledrejectionSpy
    ;({ stop: stopCollectingUnhandledError } = instrumentUnhandledRejection(callbackSpy))
  })

  afterEach(() => {
    window.onunhandledrejection = originalOnUnhandledRejectionHandler
    stopCollectingUnhandledError()
  })

  it('should call original unhandled rejection handler', () => {
    window.onunhandledrejection!({
      reason: new Error(ERROR_MESSAGE),
    } as PromiseRejectionEvent)

    expect(onUnhandledrejectionSpy).toHaveBeenCalled()
  })

  it('should notify unhandled rejection', () => {
    const reason = new Error(ERROR_MESSAGE)
    window.onunhandledrejection!({ reason } as PromiseRejectionEvent)

    const [stack, originalError] = callbackSpy.calls.mostRecent().args

    expect(originalError).toBe(reason)
    expect(stack).toBeDefined()
  })
})

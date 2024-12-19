import { disableJasmineUncaughtExceptionTracking, wait } from '../../../test'
import { Observable } from '../../tools/observable'
import { instrumentOnError, instrumentUnhandledRejection, trackRuntimeError } from './trackRuntimeError'
import type { RawError } from './error.types'

describe('trackRuntimeError', () => {
  const ERROR_MESSAGE = 'foo'

  const withTrackRuntimeError = async (callback: () => void): Promise<RawError> => {
    disableJasmineUncaughtExceptionTracking()

    const errorObservable = new Observable<RawError>()
    const errorNotification = new Promise<RawError>((resolve) => {
      errorObservable.subscribe((e: RawError) => resolve(e))
    })
    const { stop } = trackRuntimeError(errorObservable)

    try {
      await invokeAndWaitForErrorHandlers(callback)
      return await errorNotification
    } finally {
      stop()
    }
  }

  it('should collect unhandled error', async () => {
    const error = await withTrackRuntimeError(() => {
      throw new Error(ERROR_MESSAGE)
    })
    expect(error.message).toEqual(ERROR_MESSAGE)
  })

  it('should collect unhandled rejection', async () => {
    if (!('onunhandledrejection' in window)) {
      pending('onunhandledrejection not supported')
    }

    const error = await withTrackRuntimeError(() => {
      // Reject with a string instead of an Error here because Jasmine forwards the
      // unhandled rejection to the onerror handler with the wrong argument structure if
      // you use an Error. (It uses the argument structure you'd use for
      // addEventListener('error'). We could make our error processing code robust to
      // that, but since it's a Jasmine-specific issue with a simple workaround, it makes
      // sense to just work around it here.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      void Promise.reject(ERROR_MESSAGE)
    })
    expect(error.message).toEqual(jasmine.stringContaining(ERROR_MESSAGE))
  })
})

describe('instrumentOnError', () => {
  const testLineNo = 1337
  const testColNo = 42
  const ERROR_MESSAGE = 'foo'

  const withInstrumentOnError = async (callback: () => void): Promise<jasmine.Spy> => {
    const onErrorSpy = spyOn(window as any, 'onerror')
    const callbackSpy = jasmine.createSpy()
    const { stop } = instrumentOnError(callbackSpy)

    try {
      await invokeAndWaitForErrorHandlers(callback)
      expect(onErrorSpy).toHaveBeenCalled()
      return callbackSpy
    } finally {
      stop()
    }
  }

  it('should call original error handler', async () => {
    // withInstrumentOnError() asserts that the original error handler has been called for
    // every test, so we don't need an explicit expectation here.
    await withInstrumentOnError(() => {
      throw new Error(ERROR_MESSAGE)
    })
  })

  it('should notify unhandled error instance', async () => {
    const error = new Error(ERROR_MESSAGE)
    const spy = await withInstrumentOnError(() => {
      throw error
    })

    const [stack, originalError] = spy.calls.mostRecent().args
    expect(originalError).toBe(error)
    expect(stack).toBeDefined()
  })

  it('should notify unhandled string', async () => {
    const error = 'foo' as any
    const spy = await withInstrumentOnError(() => {
      throw error
    })

    const [stack, originalError] = spy.calls.mostRecent().args
    expect(originalError).toBe(error)
    expect(stack).toBeDefined()
  })

  it('should notify unhandled object', async () => {
    const error = { a: 'foo' } as any
    const spy = await withInstrumentOnError(() => {
      throw error
    })

    const [stack, originalError] = spy.calls.mostRecent().args
    expect(originalError).toBe(error)
    expect(stack).toBeDefined()
  })

  describe('uncaught exception handling', () => {
    it('should not go into an infinite loop', async () => {
      const spy = await withInstrumentOnError(() => {
        throw new Error('expected error')
      })

      expect(spy).toHaveBeenCalledTimes(1)
      await wait(1000)
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('should get extra arguments (isWindowError and exception)', async () => {
      const exception = new Error('expected error')
      const spy = await withInstrumentOnError(() => {
        throw exception
      })

      expect(spy).toHaveBeenCalledTimes(1)
      await wait(1000)
      expect(spy).toHaveBeenCalledTimes(1)
      const [, reportedError] = spy.calls.mostRecent().args
      expect(reportedError).toEqual(exception)
    })
  })

  describe('should handle direct onerror calls', () => {
    it('with objects', async () => {
      const error = { foo: 'bar' } as any
      const spy = await withInstrumentOnError(() => {
        window.onerror!(error)
      })

      const [stack, originalError] = spy.calls.mostRecent().args
      expect(originalError).toBe(error)
      expect(stack).toBeDefined()
    })

    describe('with undefined arguments', () => {
      it('should pass undefined:undefined', async () => {
        // this is probably not good behavior;  just writing this test to verify
        // that it doesn't change unintentionally
        const spy = await withInstrumentOnError(() => {
          window.onerror!(undefined!, undefined, testLineNo)
        })

        const [stack] = spy.calls.mostRecent().args
        expect(stack.name).toBeUndefined()
        expect(stack.message).toBeUndefined()
      })
    })

    describe('when no 5th argument (error object)', () => {
      it('should separate name, message for default error types (e.g. ReferenceError)', async () => {
        const spy = await withInstrumentOnError(() => {
          window.onerror!('ReferenceError: foo is undefined', 'http://example.com', testLineNo)
        })

        const [stack] = spy.calls.mostRecent().args
        expect(stack.name).toEqual('ReferenceError')
        expect(stack.message).toEqual('foo is undefined')
      })

      it('should separate name, message for default error types (e.g. Uncaught ReferenceError)', async () => {
        // should work with/without 'Uncaught'
        const spy = await withInstrumentOnError(() => {
          window.onerror!('Uncaught ReferenceError: foo is undefined', 'http://example.com', testLineNo)
        })

        const [stack] = spy.calls.mostRecent().args
        expect(stack.name).toEqual('ReferenceError')
        expect(stack.message).toEqual('foo is undefined')
      })

      it('should separate name, message for default error types on Opera Mini', async () => {
        const spy = await withInstrumentOnError(() => {
          window.onerror!(
            'Uncaught exception: ReferenceError: Undefined variable: foo',
            'http://example.com',
            testLineNo
          )
        })

        const [stack] = spy.calls.mostRecent().args
        expect(stack.name).toEqual('ReferenceError')
        expect(stack.message).toEqual('Undefined variable: foo')
      })

      it('should separate name, message for error with multiline message', async () => {
        const spy = await withInstrumentOnError(() => {
          window.onerror!("TypeError: foo is not a function. (In 'my.function(\n foo)")
        })

        const [stack] = spy.calls.mostRecent().args
        expect(stack.message).toEqual("foo is not a function. (In 'my.function(\n foo)")
        expect(stack.name).toEqual('TypeError')
      })

      it('should ignore unknown error types', async () => {
        const spy = await withInstrumentOnError(() => {
          window.onerror!('CustomError: woo scary', 'http://example.com', testLineNo)
        })

        // TODO: should we attempt to parse this?
        const [stack] = spy.calls.mostRecent().args
        expect(stack.name).toEqual(undefined)
        expect(stack.message).toEqual('CustomError: woo scary')
      })

      it('should ignore arbitrary messages passed through onerror', async () => {
        const spy = await withInstrumentOnError(() => {
          window.onerror!('all work and no play makes homer: something something', 'http://example.com', testLineNo)
        })

        const [stack] = spy.calls.mostRecent().args
        expect(stack.name).toEqual(undefined)
        expect(stack.message).toEqual('all work and no play makes homer: something something')
      })

      it('should handle object message passed through onerror', async () => {
        const spy = await withInstrumentOnError(() => {
          window.onerror!({ foo: 'bar' } as any)
        })

        const [stack, error] = spy.calls.mostRecent().args
        expect(stack.message).toBeUndefined()
        expect(error).toEqual({ foo: 'bar' }) // consider the message as initial error
      })
    })

    describe('when 5th argument (errorObj) is not of type Error', () => {
      it('should handle strings', async () => {
        const spy = await withInstrumentOnError(() => {
          window.onerror!(
            'Any error message',
            'https://example.com',
            testLineNo,
            testColNo,
            'Actual Error Message' as any
          )
        })

        const [stack, error] = spy.calls.mostRecent().args
        expect(stack.message).toBe('Any error message')
        expect(stack.stack).toEqual([{ url: 'https://example.com', column: testColNo, line: testLineNo }])
        expect(error).toEqual('Actual Error Message')
      })

      it('should handle objects', async () => {
        const spy = await withInstrumentOnError(() => {
          window.onerror!('Any error message', 'https://example.com', testLineNo, testColNo, {
            message: 'SyntaxError',
            data: 'foo',
          } as any)
        })

        const [stack, error] = spy.calls.mostRecent().args
        expect(stack.message).toBe('Any error message')
        expect(stack.stack).toEqual([{ url: 'https://example.com', column: testColNo, line: testLineNo }])
        expect(error).toEqual({ message: 'SyntaxError', data: 'foo' })
      })
    })
  })
})

describe('instrumentUnhandledRejection', () => {
  const ERROR_MESSAGE = 'foo'

  const withInstrumentOnUnhandledRejection = async (callback: () => void) => {
    if (!('onunhandledrejection' in window)) {
      pending('onunhandledrejection not supported')
    }

    const onUnhandledRejectionSpy = spyOn(window as any, 'onunhandledrejection')
    const callbackSpy = jasmine.createSpy()
    const { stop } = instrumentUnhandledRejection(callbackSpy)

    try {
      await invokeAndWaitForErrorHandlers(callback)
      expect(onUnhandledRejectionSpy).toHaveBeenCalled()
      return callbackSpy
    } finally {
      stop()
    }
  }

  it('should call original unhandled rejection handler', async () => {
    // withInstrumentOnUnhandledRejection() asserts that the original unhandled
    // rejection handler has been called for every test, so we don't need an
    // explicit expectation here.
    await withInstrumentOnUnhandledRejection(() => {
      window.onunhandledrejection!({
        reason: new Error(ERROR_MESSAGE),
      } as PromiseRejectionEvent)
    })
  })

  it('should notify unhandled rejection', async () => {
    const reason = new Error(ERROR_MESSAGE)
    const spy = await withInstrumentOnUnhandledRejection(() => {
      window.onunhandledrejection!({ reason } as PromiseRejectionEvent)
    })

    const [stack, originalError] = spy.calls.mostRecent().args
    expect(originalError).toBe(reason)
    expect(stack).toBeDefined()
  })
})

/**
 * Invokes the given callback, which is expected to be a function that throws or generates
 * an unhandled promise rejection, and returns a promise that resolves after the callback
 * has finished running and any global error handlers that run as a result are complete.
 */
function invokeAndWaitForErrorHandlers(callback: () => void): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      try {
        // Invoke the callback.
        callback()
      } finally {
        // The callback has generated an error here, but global error handlers
        // have not yet run. The global unhandledrejection handler will run at
        // the end of the next microtask checkpoint; the global error handler
        // will run in a later macrotask. So, schedule a new task to resolve
        // the promise after both of those things have happened.
        setTimeout(resolve)
      }
    })
  })
}

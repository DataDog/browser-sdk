import { noop } from '@datadog/js-core/util'
import { clocksNow } from '@datadog/js-core/time'
import { disableJasmineUncaughtExceptionTracking, registerCleanupTask, wait } from '../../../test'
import { computeRuntimeError } from './computeRuntimeError'
import type { UnhandledErrorCallback } from './trackRuntimeError'
import { instrumentOnError, instrumentUnhandledRejection, trackRuntimeError } from './trackRuntimeError'
import type { RawError } from './error.types'

describe('trackRuntimeError', () => {
  it('captures errors without reading their properties', () => {
    spyOn(window as any, 'onerror')
    const error = new Error('early')
    const readCause = jasmine.createSpy().and.returnValue(undefined)
    Object.defineProperty(error, 'cause', { get: readCause })
    const received = jasmine.createSpy()
    const subscription = trackRuntimeError().subscribe(received)
    registerCleanupTask(subscription.unsubscribe)

    window.onerror!('early', 'https://example.com/app.js', 12, 34, error)

    expect(readCause).not.toHaveBeenCalled()
    expect(received).toHaveBeenCalledTimes(1)
  })

  const ERROR_MESSAGE = 'foo'

  const errorViaTrackRuntimeError = async (callback: () => void): Promise<RawError> => {
    disableJasmineUncaughtExceptionTracking()

    const errorObservable = trackRuntimeError()
    let unsubscribe = noop
    const errorNotification = new Promise<RawError>((resolve) => {
      ;({ unsubscribe } = errorObservable.subscribe((error) => resolve(computeRuntimeError(error))))
    })

    try {
      await invokeAndWaitForErrorHandlers(callback)
      return await errorNotification
    } finally {
      unsubscribe()
    }
  }

  it('should collect unhandled error', async () => {
    const error = await errorViaTrackRuntimeError(() => {
      throw new Error(ERROR_MESSAGE)
    })
    expect(error.message).toEqual(ERROR_MESSAGE)
  })

  it('should collect unhandled rejection', async () => {
    const error = await errorViaTrackRuntimeError(() => {
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

describe('onerror capture and processing', () => {
  const testLineNo = 1337
  const testColNo = 42
  const ERROR_MESSAGE = 'foo'

  const spyViaInstrumentOnError = async (callback: () => void) => {
    const onErrorSpy = spyOn(window as any, 'onerror')
    const callbackSpy = jasmine.createSpy<(originalError: unknown, error: RawError) => void>()
    const { stop } = instrumentOnError((originalError, onError) => {
      callbackSpy(originalError, computeRuntimeError({ originalError, onError, startClocks: clocksNow() }))
    })

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
    await spyViaInstrumentOnError(() => {
      throw new Error(ERROR_MESSAGE)
    })
  })

  it('should notify unhandled error instance', async () => {
    const error = new Error(ERROR_MESSAGE)
    const spy = await spyViaInstrumentOnError(() => {
      throw error
    })

    const [originalError, stack] = spy.calls.mostRecent().args
    expect(originalError).toBe(error)
    expect(stack.message).toBe(ERROR_MESSAGE)
  })

  it('should notify unhandled string', async () => {
    const error = 'foo' as any
    const spy = await spyViaInstrumentOnError(() => {
      throw error
    })

    const [originalError, stack] = spy.calls.mostRecent().args
    expect(originalError).toBe(error)
    expect(stack).toBeDefined()
  })

  it('should notify unhandled object', async () => {
    const error = { a: 'foo' } as any
    const spy = await spyViaInstrumentOnError(() => {
      throw error
    })

    const [originalError, stack] = spy.calls.mostRecent().args
    expect(originalError).toBe(error)
    expect(stack).toBeDefined()
  })

  describe('uncaught exception handling', () => {
    it('should not go into an infinite loop', async () => {
      const spy = await spyViaInstrumentOnError(() => {
        throw new Error('expected error')
      })

      expect(spy).toHaveBeenCalledTimes(1)
      await wait(1000)
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('should get extra arguments (isWindowError and exception)', async () => {
      const exception = new Error('expected error')
      const spy = await spyViaInstrumentOnError(() => {
        throw exception
      })

      expect(spy).toHaveBeenCalledTimes(1)
      await wait(1000)
      expect(spy).toHaveBeenCalledTimes(1)
      const [reportedError] = spy.calls.mostRecent().args
      expect(reportedError).toEqual(exception)
    })
  })

  describe('should handle direct onerror calls', () => {
    it('with objects', async () => {
      const error = { foo: 'bar' } as any
      const spy = await spyViaInstrumentOnError(() => {
        window.onerror!(error, 'http://example.com', testLineNo, testColNo)
      })

      const [originalError, stack] = spy.calls.mostRecent().args
      expect(originalError).toBe(error)
      expect(stack).toBeDefined()
    })

    describe('with undefined arguments', () => {
      it('discards the stack', async () => {
        // this is probably not good behavior;  just writing this test to verify
        // that it doesn't change unintentionally
        const spy = await spyViaInstrumentOnError(() => {
          window.onerror!(undefined!, undefined, testLineNo)
        })

        const [, stack] = spy.calls.mostRecent().args
        expect(stack.stack).toBe('No stack, consider using an instance of Error')
      })
    })

    describe('when no 5th argument (error object)', () => {
      it('should separate name, message for default error types (e.g. ReferenceError)', async () => {
        const spy = await spyViaInstrumentOnError(() => {
          window.onerror!('ReferenceError: foo is undefined', 'http://example.com', testLineNo)
        })

        const [, stack] = spy.calls.mostRecent().args
        expect(stack.type).toEqual('ReferenceError')
        expect(stack.message).toEqual('foo is undefined')
      })

      it('should separate name, message for default error types (e.g. Uncaught ReferenceError)', async () => {
        // should work with/without 'Uncaught'
        const spy = await spyViaInstrumentOnError(() => {
          window.onerror!('Uncaught ReferenceError: foo is undefined', 'http://example.com', testLineNo)
        })

        const [, stack] = spy.calls.mostRecent().args
        expect(stack.type).toEqual('ReferenceError')
        expect(stack.message).toEqual('foo is undefined')
      })

      it('should separate name, message for default error types on Opera Mini', async () => {
        const spy = await spyViaInstrumentOnError(() => {
          window.onerror!(
            'Uncaught exception: ReferenceError: Undefined variable: foo',
            'http://example.com',
            testLineNo
          )
        })

        const [, stack] = spy.calls.mostRecent().args
        expect(stack.type).toEqual('ReferenceError')
        expect(stack.message).toEqual('Undefined variable: foo')
      })

      it('should separate name, message for error with multiline message', async () => {
        const spy = await spyViaInstrumentOnError(() => {
          window.onerror!(
            "TypeError: foo is not a function. (In 'my.function(\n foo)",
            'http://example.com',
            testLineNo
          )
        })

        const [, stack] = spy.calls.mostRecent().args
        expect(stack.message).toEqual("foo is not a function. (In 'my.function(\n foo)")
        expect(stack.type).toEqual('TypeError')
      })

      it('should ignore unknown error types', async () => {
        const spy = await spyViaInstrumentOnError(() => {
          window.onerror!('CustomError: woo scary', 'http://example.com', testLineNo)
        })

        // TODO: should we attempt to parse this?
        const [, stack] = spy.calls.mostRecent().args
        expect(stack.type).toEqual(undefined)
        expect(stack.message).toEqual('Uncaught "CustomError: woo scary"')
      })

      it('should ignore arbitrary messages passed through onerror', async () => {
        const spy = await spyViaInstrumentOnError(() => {
          window.onerror!('all work and no play makes homer: something something', 'http://example.com', testLineNo)
        })

        const [, stack] = spy.calls.mostRecent().args
        expect(stack.type).toEqual(undefined)
        expect(stack.message).toEqual('Uncaught "all work and no play makes homer: something something"')
      })

      it('should handle object message passed through onerror', async () => {
        const spy = await spyViaInstrumentOnError(() => {
          window.onerror!({ foo: 'bar' } as any, 'http://example.com', testLineNo, testColNo)
        })

        const [error, stack] = spy.calls.mostRecent().args
        expect(stack.message).toBe('Uncaught {"foo":"bar"}')
        expect(error).toEqual({ foo: 'bar' }) // consider the message as initial error
      })
    })

    describe('when 5th argument (errorObj) is not of type Error', () => {
      it('should handle strings', async () => {
        const spy = await spyViaInstrumentOnError(() => {
          window.onerror!(
            'Any error message',
            'https://example.com',
            testLineNo,
            testColNo,
            'Actual Error Message' as any
          )
        })

        const [error, stack] = spy.calls.mostRecent().args
        expect(stack.message).toBe('Uncaught "Actual Error Message"')
        expect(stack.stack).toContain('https://example.com:1337:42')
        expect(error).toEqual('Actual Error Message')
      })

      it('should handle objects', async () => {
        const spy = await spyViaInstrumentOnError(() => {
          window.onerror!('Any error message', 'https://example.com', testLineNo, testColNo, {
            message: 'SyntaxError',
            data: 'foo',
          } as any)
        })

        const [error, stack] = spy.calls.mostRecent().args
        expect(stack.message).toBe('Uncaught {"message":"SyntaxError","data":"foo"}')
        expect(stack.stack).toContain('https://example.com:1337:42')
        expect(error).toEqual({ message: 'SyntaxError', data: 'foo' })
      })
    })
  })
})

describe('instrumentUnhandledRejection', () => {
  const ERROR_MESSAGE = 'foo'

  const spyViaInstrumentOnUnhandledRejection = async (callback: () => void) => {
    const onUnhandledRejectionSpy = spyOn(window as any, 'onunhandledrejection')
    const callbackSpy = jasmine.createSpy<UnhandledErrorCallback>()
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
    await spyViaInstrumentOnUnhandledRejection(() => {
      window.onunhandledrejection!({
        reason: new Error(ERROR_MESSAGE),
      } as PromiseRejectionEvent)
    })
  })

  it('should notify unhandled rejection', async () => {
    const reason = new Error(ERROR_MESSAGE)
    const spy = await spyViaInstrumentOnUnhandledRejection(() => {
      window.onunhandledrejection!({ reason } as PromiseRejectionEvent)
    })

    const [originalError, stack] = spy.calls.mostRecent().args
    expect(originalError).toBe(reason)
    expect(stack).toBeUndefined()
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

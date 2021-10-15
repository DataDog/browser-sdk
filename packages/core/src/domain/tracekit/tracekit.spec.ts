import { disableJasmineUncaughtErrorHandler } from '../../../test/specHelper'
import { subscribe, unsubscribe, traceKitWindowOnError } from './tracekit'
import { Handler, StackFrame } from './types'

describe('traceKitWindowOnError', () => {
  const testLineNo = 1337

  let subscriptionHandler: Handler | undefined
  let resetJasmineUncaughtErrorHandler: () => void

  beforeEach(() => {
    ;({ reset: resetJasmineUncaughtErrorHandler } = disableJasmineUncaughtErrorHandler())
  })

  afterEach(() => {
    resetJasmineUncaughtErrorHandler()
  })

  describe('with undefined arguments', () => {
    it('should pass undefined:undefined', (done) => {
      // this is probably not good behavior;  just writing this test to verify
      // that it doesn't change unintentionally
      subscriptionHandler = (stack) => {
        expect(stack.name).toBeUndefined()
        expect(stack.message).toBeUndefined()
        unsubscribe(subscriptionHandler!)
        done()
      }
      subscribe(subscriptionHandler)
      traceKitWindowOnError(undefined!, undefined, testLineNo)
    })
  })

  describe('when no 5th argument (error object)', () => {
    it('should separate name, message for default error types (e.g. ReferenceError)', (done) => {
      subscriptionHandler = (stack) => {
        expect(stack.name).toEqual('ReferenceError')
        expect(stack.message).toEqual('foo is undefined')
        unsubscribe(subscriptionHandler!)
        done()
      }
      subscribe(subscriptionHandler)
      traceKitWindowOnError('ReferenceError: foo is undefined', 'http://example.com', testLineNo)
    })

    it('should separate name, message for default error types (e.g. Uncaught ReferenceError)', (done) => {
      subscriptionHandler = (stack) => {
        expect(stack.name).toEqual('ReferenceError')
        expect(stack.message).toEqual('foo is undefined')
        unsubscribe(subscriptionHandler!)
        done()
      }
      subscribe(subscriptionHandler)
      // should work with/without 'Uncaught'
      traceKitWindowOnError('Uncaught ReferenceError: foo is undefined', 'http://example.com', testLineNo)
    })

    it('should separate name, message for default error types on Opera Mini', (done) => {
      subscriptionHandler = (stack) => {
        expect(stack.name).toEqual('ReferenceError')
        expect(stack.message).toEqual('Undefined variable: foo')
        unsubscribe(subscriptionHandler!)
        done()
      }
      subscribe(subscriptionHandler)
      traceKitWindowOnError(
        'Uncaught exception: ReferenceError: Undefined variable: foo',
        'http://example.com',
        testLineNo
      )
    })

    it('should ignore unknown error types', (done) => {
      // TODO: should we attempt to parse this?
      subscriptionHandler = (stack) => {
        expect(stack.name).toEqual(undefined)
        expect(stack.message).toEqual('CustomError: woo scary')
        unsubscribe(subscriptionHandler!)
        done()
      }
      subscribe(subscriptionHandler)
      traceKitWindowOnError('CustomError: woo scary', 'http://example.com', testLineNo)
    })

    it('should ignore arbitrary messages passed through onerror', (done) => {
      subscriptionHandler = (stack) => {
        expect(stack.name).toEqual(undefined)
        expect(stack.message).toEqual('all work and no play makes homer: something something')
        unsubscribe(subscriptionHandler!)
        done()
      }
      subscribe(subscriptionHandler)
      traceKitWindowOnError('all work and no play makes homer: something something', 'http://example.com', testLineNo)
    })

    it('should handle object message passed through onerror', (done) => {
      subscriptionHandler = (stack, _, error) => {
        expect(stack.message).toBeUndefined()
        expect(error).toEqual({ foo: 'bar' }) // consider the message as initial error
        unsubscribe(subscriptionHandler!)
        done()
      }
      subscribe(subscriptionHandler)
      traceKitWindowOnError({ foo: 'bar' } as any)
    })
  })
})

describe('uncaught exception handling', () => {
  let resetJasmineUncaughtErrorHandler: () => void

  beforeEach(() => {
    ;({ reset: resetJasmineUncaughtErrorHandler } = disableJasmineUncaughtErrorHandler())
  })

  afterEach(() => {
    resetJasmineUncaughtErrorHandler()
  })

  it('it should not go into an infinite loop', (done) => {
    const stacks = []

    function handler(stackInfo: StackFrame) {
      stacks.push(stackInfo)
    }

    subscribe(handler)

    setTimeout(() => {
      throw new Error('expected error')
    })

    setTimeout(() => {
      unsubscribe(handler)
      expect(stacks.length).toEqual(1)
      done()
    }, 1000)
  })

  it('should get extra arguments (isWindowError and exception)', (done) => {
    const handler = jasmine.createSpy()

    const exception = new Error('expected error')

    subscribe(handler)

    setTimeout(() => {
      throw exception
    })

    setTimeout(() => {
      unsubscribe(handler)

      expect(handler).toHaveBeenCalledTimes(1)

      const isWindowError = handler.calls.mostRecent().args[1]
      expect(isWindowError).toEqual(true)

      const e = handler.calls.mostRecent().args[2]
      expect(e).toEqual(exception)

      done()
    }, 1000)
  })
})

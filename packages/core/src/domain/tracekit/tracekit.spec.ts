import { disableJasmineUncaughtErrorHandler } from '../../../test/specHelper'
import { subscribe, unsubscribe, traceKitWindowOnError } from './tracekit'
import { Handler } from './types'

describe('traceKitWindowOnError', () => {
  const testLineNo = 1337

  let subscriptionHandler: jasmine.Spy<Handler>
  let resetJasmineUncaughtErrorHandler: () => void

  beforeEach(() => {
    ;({ reset: resetJasmineUncaughtErrorHandler } = disableJasmineUncaughtErrorHandler())
    subscriptionHandler = jasmine.createSpy()
    subscribe(subscriptionHandler)
  })

  afterEach(() => {
    unsubscribe(subscriptionHandler)
    resetJasmineUncaughtErrorHandler()
  })

  describe('with undefined arguments', () => {
    it('should pass undefined:undefined', () => {
      // this is probably not good behavior;  just writing this test to verify
      // that it doesn't change unintentionally
      traceKitWindowOnError(undefined!, undefined, testLineNo)
      const [stack] = subscriptionHandler.calls.mostRecent().args
      expect(stack.name).toBeUndefined()
      expect(stack.message).toBeUndefined()
    })
  })

  describe('when no 5th argument (error object)', () => {
    it('should separate name, message for default error types (e.g. ReferenceError)', () => {
      traceKitWindowOnError('ReferenceError: foo is undefined', 'http://example.com', testLineNo)
      const [stack, ,] = subscriptionHandler.calls.mostRecent().args
      expect(stack.name).toEqual('ReferenceError')
      expect(stack.message).toEqual('foo is undefined')
    })

    it('should separate name, message for default error types (e.g. Uncaught ReferenceError)', () => {
      // should work with/without 'Uncaught'
      traceKitWindowOnError('Uncaught ReferenceError: foo is undefined', 'http://example.com', testLineNo)
      const [stack, ,] = subscriptionHandler.calls.mostRecent().args
      expect(stack.name).toEqual('ReferenceError')
      expect(stack.message).toEqual('foo is undefined')
    })

    it('should separate name, message for default error types on Opera Mini', () => {
      traceKitWindowOnError(
        'Uncaught exception: ReferenceError: Undefined variable: foo',
        'http://example.com',
        testLineNo
      )
      const [stack, ,] = subscriptionHandler.calls.mostRecent().args
      expect(stack.name).toEqual('ReferenceError')
      expect(stack.message).toEqual('Undefined variable: foo')
    })

    it('should ignore unknown error types', () => {
      traceKitWindowOnError('CustomError: woo scary', 'http://example.com', testLineNo)
      // TODO: should we attempt to parse this?
      const [stack, ,] = subscriptionHandler.calls.mostRecent().args
      expect(stack.name).toEqual(undefined)
      expect(stack.message).toEqual('CustomError: woo scary')
    })

    it('should ignore arbitrary messages passed through onerror', () => {
      traceKitWindowOnError('all work and no play makes homer: something something', 'http://example.com', testLineNo)
      const [stack, ,] = subscriptionHandler.calls.mostRecent().args
      expect(stack.name).toEqual(undefined)
      expect(stack.message).toEqual('all work and no play makes homer: something something')
    })

    it('should handle object message passed through onerror', () => {
      traceKitWindowOnError({ foo: 'bar' } as any)
      const [stack, , error] = subscriptionHandler.calls.mostRecent().args
      expect(stack.message).toBeUndefined()
      expect(error).toEqual({ foo: 'bar' }) // consider the message as initial error
    })
  })

  describe('uncaught exception handling', () => {
    it('it should not go into an infinite loop', (done) => {
      setTimeout(() => {
        throw new Error('expected error')
      })

      setTimeout(() => {
        expect(subscriptionHandler).toHaveBeenCalledTimes(1)
        done()
      }, 1000)
    })

    it('should get extra arguments (isWindowError and exception)', (done) => {
      const exception = new Error('expected error')

      setTimeout(() => {
        throw exception
      })

      setTimeout(() => {
        expect(subscriptionHandler).toHaveBeenCalledTimes(1)

        const [, isWindowError, reportedError] = subscriptionHandler.calls.mostRecent().args
        expect(isWindowError).toEqual(true)
        expect(reportedError).toEqual(exception)

        done()
      }, 1000)
    })
  })
})

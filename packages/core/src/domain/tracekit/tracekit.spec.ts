import { disableJasmineUncaughtErrorHandler } from '../../../test/specHelper'
import { startUnhandledErrorCollection } from './tracekit'
import type { UnhandledErrorCallback } from './types'

describe('startUnhandledErrorCollection', () => {
  const testLineNo = 1337

  let callbackSpy: jasmine.Spy<UnhandledErrorCallback>
  let stopCollectingUnhandledError: () => void
  let resetJasmineUncaughtErrorHandler: () => void

  beforeEach(() => {
    ;({ reset: resetJasmineUncaughtErrorHandler } = disableJasmineUncaughtErrorHandler())
    callbackSpy = jasmine.createSpy()
    ;({ stop: stopCollectingUnhandledError } = startUnhandledErrorCollection(callbackSpy))
  })

  afterEach(() => {
    stopCollectingUnhandledError()
    resetJasmineUncaughtErrorHandler()
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

  describe('uncaught exception handling', () => {
    it('it should not go into an infinite loop', (done) => {
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
})

import { report, subscribe, unsubscribe, traceKitWindowOnError } from './report'
import { Handler } from './types'

describe('report', () => {
  const testMessage = '__mocha_ignore__'
  const testLineNo = 1337

  let subscriptionHandler: Handler | undefined

  beforeEach(() => {
    // do not fail specs due to error being rethrown
    window.onerror = jasmine.createSpy()
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

  function testErrorNotification(callOnError: boolean, numReports: number, done: DoneFn) {
    let numDone = 0

    subscriptionHandler = () => {
      numDone += 1
      if (numDone === numReports) {
        unsubscribe(subscriptionHandler!)
        done()
      }
    }
    subscribe(subscriptionHandler)

    // report always throws an exception in order to trigger
    // window.onerror so it can gather more stack data. Mocha treats
    // uncaught exceptions as errors, so we catch it via assert.throws
    // here (and manually call window.onerror later if appropriate).
    //
    // We test multiple reports because TraceKit has special logic for when
    // report() is called a second time before either a timeout elapses or
    // window.onerror is called (which is why we always call window.onerror
    // only once below, after all calls to report()).
    for (let i = 0; i < numReports; i += 1) {
      const e = new Error('testing')
      expect(() => {
        report(e)
      }).toThrow(e)
    }
    // The call to report should work whether or not window.onerror is
    // triggered, so we parameterize it for the tests. We only call it
    // once, regardless of numReports, because the case we want to test for
    // multiple reports is when window.onerror is *not* called between them.
    if (callOnError) {
      traceKitWindowOnError(testMessage)
    }
  }

  ;[false, true].forEach((callOnError) => {
    ;[1, 2].forEach((numReports) => {
      let title = 'it should receive arguments from report() when'
      title += ` callOnError is ${String(callOnError)}`
      title += ` and numReports is ${numReports}`
      it(
        title,
        (done) => {
          testErrorNotification(callOnError, numReports, done)
        },
        5000
      )
    })
  })
})

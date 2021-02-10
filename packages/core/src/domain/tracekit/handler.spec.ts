import { report, subscribe, unsubscribe } from './report'
import { StackFrame } from './types'

describe('Handler', () => {
  it('it should not go into an infinite loop', (done) => {
    const stacks = []

    function handler(stackInfo: StackFrame) {
      stacks.push(stackInfo)
    }

    function throwException() {
      throw new Error('Boom!')
    }

    subscribe(handler)
    expect(() => wrap(throwException)()).toThrowError()

    setTimeout(() => {
      unsubscribe(handler)
      expect(stacks.length).toEqual(1)
      done()
    }, 1000)
  })

  it('should get extra arguments (isWindowError and exception)', (done) => {
    const handler = jasmine.createSpy()

    const exception = new Error('Boom!')

    function throwException() {
      throw exception
    }

    subscribe(handler)
    expect(() => wrap(throwException)()).toThrowError()

    setTimeout(() => {
      unsubscribe(handler)

      expect(handler).toHaveBeenCalledTimes(1)

      const isWindowError = handler.calls.mostRecent().args[1]
      expect(isWindowError).toEqual(false)

      const e = handler.calls.mostRecent().args[2]
      expect(e).toEqual(exception)

      done()
    }, 1000)
  })
})

function wrap<Args extends any[], R>(func: (...args: Args) => R) {
  function wrapped(this: unknown, ...args: Args) {
    try {
      return func.apply(this, args)
    } catch (e) {
      report(e)
      throw e
    }
  }
  return wrapped
}

// tslint:disable no-unsafe-any

import { report, StackFrame, wrap } from './tracekit'

describe('Handler', () => {
  it('it should not go into an infinite loop', (done) => {
    const stacks = []

    function handler(stackInfo: StackFrame) {
      stacks.push(stackInfo)
    }

    function throwException() {
      throw new Error('Boom!')
    }

    report.subscribe(handler)
    expect(() => wrap(throwException)()).toThrowError()

    setTimeout(() => {
      report.unsubscribe(handler)
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

    report.subscribe(handler)
    expect(() => wrap(throwException)()).toThrowError()

    setTimeout(() => {
      report.unsubscribe(handler)

      expect(handler).toHaveBeenCalledTimes(1)

      const isWindowError = handler.calls.mostRecent().args[1]
      expect(isWindowError).toEqual(false)

      const e = handler.calls.mostRecent().args[2]
      expect(e).toEqual(exception)

      done()
    }, 1000)
  })
})

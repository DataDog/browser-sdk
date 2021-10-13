import { disableJasmineUncaughtErrorHandler } from '../../../test/specHelper'
import { subscribe, unsubscribe } from './report'
import { StackFrame } from './types'

describe('Handler', () => {
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

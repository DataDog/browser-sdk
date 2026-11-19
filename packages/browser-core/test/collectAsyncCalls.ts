import { expect } from 'vitest'
import type { Mock } from 'vitest'
import { getCurrentJasmineSpec } from './getCurrentJasmineSpec'

type Procedure = (...args: any[]) => any

export function collectAsyncCalls<F extends Procedure>(
  spy: Mock<F>,
  expectedCallsCount = 1
): Promise<Mock<F>['mock']['calls']> {
  return new Promise((resolve, reject) => {
    const currentSpec = getCurrentJasmineSpec()
    if (!currentSpec) {
      reject(new Error('collectAsyncCalls should be called within a test'))
      return
    }

    const checkCalls = () => {
      if (spy.mock.calls.length === expectedCallsCount) {
        resolve(spy.mock.calls)
      } else if (spy.mock.calls.length > expectedCallsCount) {
        const message = `Unexpected extra call for spec '${currentSpec.fullName}'`
        expect.unreachable(message)
        reject(new Error(message))
      }
    }

    checkCalls()
    onCall(spy, checkCalls)
  })
}

// Vitest records each call by pushing its arguments to `mock.calls`, before running the mock
// implementation. Observe that instead of replacing the implementation, so spies created with
// `vi.spyOn()` keep calling through to the original method. `mockClear()` replaces the array, which
// stops the observation.
function onCall(spy: Mock, callback: () => void) {
  const calls = spy.mock.calls
  const push = calls.push.bind(calls)
  calls.push = (...items) => {
    const length = push(...items)
    callback()
    return length
  }
}

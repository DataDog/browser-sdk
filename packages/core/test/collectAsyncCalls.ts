import type { MockInstance } from 'vitest'
import { expect } from 'vitest'
import { getCurrentJasmineSpec } from './getCurrentJasmineSpec'

export function collectAsyncCalls<T extends (...args: any[]) => any>(
  spy: MockInstance<T>,
  expectedCallsCount = 1
): Promise<MockInstance<T>> {
  return new Promise((resolve, reject) => {
    const currentSpec = getCurrentJasmineSpec()
    if (!currentSpec) {
      reject(new Error('collectAsyncCalls should be called within vitest code'))
      return
    }

    const checkCalls = () => {
      if (spy.mock.calls.length === expectedCallsCount) {
        spy.mockImplementation(extraCallDetected as T)
        resolve(spy)
      } else if (spy.mock.calls.length > expectedCallsCount) {
        extraCallDetected()
      }
    }

    checkCalls()

    spy.mockImplementation((() => {
      checkCalls()
    }) as T)

    function extraCallDetected() {
      const message = `Unexpected extra call for spec '${currentSpec!.fullName}'`
      expect.fail(message)
      reject(new Error(message))
    }
  })
}

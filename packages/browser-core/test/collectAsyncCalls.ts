import { expect } from 'vitest'
import { getCurrentJasmineSpec } from './getCurrentJasmineSpec'

interface Spy<Args extends unknown[]> {
  mock: { calls: Args[] }
}

export function collectAsyncCalls<Args extends unknown[]>(spy: Spy<Args>, expectedCallsCount = 1): Promise<Args[]> {
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

// Vitest records each call by pushing its arguments to `mock.calls` (with `Array.prototype.push`, so a
// `push` override would be bypassed), before running the mock implementation. Observe that instead of
// replacing the implementation, so spies created with `vi.spyOn()` keep calling through to the original
// method: `mock.calls` is replaced by a proxy notified once a call is recorded. A new observation of the
// same spy replaces the previous one. `mockClear()` replaces the array, which stops the observation.
const observedCalls = new WeakMap<unknown[][], unknown[][]>()

function onCall(spy: Spy<unknown[]>, callback: () => void) {
  const target = observedCalls.get(spy.mock.calls) ?? spy.mock.calls
  const proxy = new Proxy(target, {
    set(array, property, value) {
      Reflect.set(array, property, value)
      // `push` sets the new index, then `length`
      if (property === 'length') {
        callback()
      }
      return true
    },
  })
  observedCalls.set(proxy, target)
  spy.mock.calls = proxy
}

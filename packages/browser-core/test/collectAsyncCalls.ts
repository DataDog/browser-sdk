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

// Vitest records each call by pushing its arguments to `mock.calls`, before running the mock
// implementation. Observe that instead of replacing the implementation, so spies created with
// `vi.spyOn()` keep calling through to the original method. A new observation of the same spy
// replaces the previous one. `mockClear()` replaces the array, which stops the observation.
const originalPushes = new WeakMap<unknown[], unknown[]['push']>()

function onCall(spy: Spy<unknown[]>, callback: () => void) {
  const calls = spy.mock.calls
  let push = originalPushes.get(calls)
  if (!push) {
    push = calls.push.bind(calls)
    originalPushes.set(calls, push)
  }
  const originalPush = push
  calls.push = (...items) => {
    const length = originalPush(...items)
    callback()
    return length
  }
}

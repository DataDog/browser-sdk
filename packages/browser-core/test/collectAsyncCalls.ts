import type { Mock } from 'vitest'

export interface MockCalls<F extends (...args: any[]) => any> {
  all(): Array<{ args: Parameters<F>; returnValue: ReturnType<F> }>
  count(): number
  argsFor(index: number): Parameters<F>
  mostRecent(): { args: Parameters<F>; returnValue: ReturnType<F> }
}

type Implementation = (...args: any[]) => unknown

const originalImplementationForGuard = new WeakMap<Implementation, Implementation | undefined>()

export function collectAsyncCalls<F extends (...args: any[]) => any>(
  spy: Mock<F>,
  expectedCallsCount = 1
): Promise<MockCalls<F>> {
  return new Promise((resolve, reject) => {
    const checkCalls = () => {
      if (spy.mock.calls.length === expectedCallsCount) {
        resolve(wrapMockCalls(spy))
      } else if (spy.mock.calls.length > expectedCallsCount) {
        const message = `Unexpected extra call (expected ${expectedCallsCount}, got ${spy.mock.calls.length})`
        reject(new Error(message))
        // `reject` is a no-op once the promise already resolved (the common case: the extra call
        // happens after the expected count was reached). Throw in a fresh microtask so it surfaces
        // as an uncaught error and still fails the currently running test.
        queueMicrotask(() => {
          throw new Error(message)
        })
      }
    }

    checkCalls()

    const originalImplementation = getOriginalImplementation(spy)
    // ponytail: a `vi.spyOn` spy without a mock implementation stops calling through once guarded
    const guard: Implementation = (...args) => {
      checkCalls()
      return originalImplementation?.(...args)
    }
    originalImplementationForGuard.set(guard, originalImplementation)
    spy.mockImplementation(guard as any)
  })
}

// Unwrap the guard installed by a previous `collectAsyncCalls` on the same spy, so guards don't stack
function getOriginalImplementation<F extends (...args: any[]) => any>(spy: Mock<F>): Implementation | undefined {
  const implementation: Implementation | undefined = spy.getMockImplementation()
  return implementation && originalImplementationForGuard.has(implementation)
    ? originalImplementationForGuard.get(implementation)
    : implementation
}

function wrapMockCalls<F extends (...args: any[]) => any>(spy: Mock<F>): MockCalls<F> {
  return {
    all: () =>
      spy.mock.calls.map((args, i) => ({
        args: args as Parameters<F>,
        returnValue: spy.mock.results[i]?.value as ReturnType<F>,
      })),
    count: () => spy.mock.calls.length,
    argsFor: (index: number) => spy.mock.calls[index] as Parameters<F>,
    mostRecent: () => {
      const lastIndex = spy.mock.calls.length - 1
      return {
        args: spy.mock.calls[lastIndex] as Parameters<F>,
        returnValue: spy.mock.results[lastIndex]?.value as ReturnType<F>,
      }
    },
  }
}

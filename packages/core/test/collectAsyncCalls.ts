import type { Mock } from 'vitest'

export interface MockCalls<F extends (...args: any[]) => any> {
  all(): Array<{ args: Parameters<F>; returnValue: ReturnType<F> }>
  count(): number
  argsFor(index: number): Parameters<F>
  mostRecent(): { args: Parameters<F>; returnValue: ReturnType<F> }
}

export function collectAsyncCalls<F extends (...args: any[]) => any>(
  spy: Mock<F>,
  expectedCallsCount = 1
): Promise<MockCalls<F>> {
  return new Promise((resolve, reject) => {
    const checkCalls = () => {
      if (spy.mock.calls.length === expectedCallsCount) {
        spy.mockImplementation(extraCallDetected as any)
        resolve(wrapMockCalls(spy))
      } else if (spy.mock.calls.length > expectedCallsCount) {
        extraCallDetected()
      }
    }

    checkCalls()

    spy.mockImplementation((() => {
      checkCalls()
    }) as any)

    function extraCallDetected() {
      const message = `Unexpected extra call (expected ${expectedCallsCount}, got ${spy.mock.calls.length})`
      reject(new Error(message))
    }
  })
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

import { onTestFinished, type Mock } from 'vitest'

const activeGuards = new WeakMap<object, () => void>()
const originalImplementations = new WeakMap<(...args: any[]) => any, ((...args: any[]) => any) | undefined>()

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
    const currentImplementation = spy.getMockImplementation() as ((...args: any[]) => any) | undefined
    const originalImplementation =
      currentImplementation && originalImplementations.has(currentImplementation)
        ? originalImplementations.get(currentImplementation)
        : currentImplementation
    activeGuards.get(spy)?.()

    let guardIsActive = true
    activeGuards.set(spy, () => {
      guardIsActive = false
    })

    onTestFinished(() => {
      // Some callers explicitly clear the mock during cleanup to stop the guard before tearing
      // down the observed component. Extra calls still throw synchronously when they happen.
      if (guardIsActive && spy.mock.calls.length !== 0 && spy.mock.calls.length !== expectedCallsCount) {
        throw createUnexpectedCallCountError(spy, expectedCallsCount)
      }
    })

    function extraCallDetected(): Error {
      const error = createUnexpectedCallCountError(spy, expectedCallsCount)
      reject(error)
      return error
    }

    const checkCalls = () => {
      if (spy.mock.calls.length === expectedCallsCount) {
        const guardImplementation = ((...args: Parameters<F>) => {
          originalImplementation?.(...args)
          throw extraCallDetected()
        }) as unknown as Parameters<Mock<F>['mockImplementation']>[0]
        originalImplementations.set(guardImplementation, originalImplementation)
        spy.mockImplementation(guardImplementation)
        resolve(wrapMockCalls(spy))
      } else if (spy.mock.calls.length > expectedCallsCount) {
        extraCallDetected()
      }
    }

    const collectingImplementation = ((...args: Parameters<F>) => {
      let result: ReturnType<F> | undefined
      try {
        result = originalImplementation?.(...args)
      } finally {
        checkCalls()
      }
      return result as ReturnType<F>
    }) as Parameters<Mock<F>['mockImplementation']>[0]
    originalImplementations.set(collectingImplementation, originalImplementation)
    spy.mockImplementation(collectingImplementation)

    checkCalls()
  })
}

function createUnexpectedCallCountError<F extends (...args: any[]) => any>(
  spy: Mock<F>,
  expectedCallsCount: number
): Error {
  return new Error(`Unexpected call count (expected ${expectedCallsCount}, got ${spy.mock.calls.length})`)
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

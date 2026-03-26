import { getCurrentJasmineSpec } from './getCurrentJasmineSpec'

// Track guard functions set after resolution, so chained collectAsyncCalls
// can detect and skip them instead of triggering a false "extra call" failure.
const extraCallGuards = new WeakSet<() => void>()

export function collectAsyncCalls<F extends jasmine.Func>(
  spy: jasmine.Spy<F>,
  expectedCallsCount = 1
): Promise<jasmine.Calls<F>> {
  return new Promise((resolve, reject) => {
    const currentSpec = getCurrentJasmineSpec()
    if (!currentSpec) {
      reject(new Error('collectAsyncCalls should be called within jasmine code'))
      return
    }

    const checkCalls = () => {
      if (spy.calls.count() === expectedCallsCount) {
        const guard = (() => extraCallDetected()) as F
        extraCallGuards.add(guard)
        spy.and.callFake(guard)
        resolve(spy.calls)
      } else if (spy.calls.count() > expectedCallsCount) {
        extraCallDetected()
      }
    }

    checkCalls()

    const previousPlan: F = (spy.and as unknown as { plan: F }).plan

    spy.and.callFake(((...args: Parameters<F>) => {
      checkCalls()
      if (!extraCallGuards.has(previousPlan)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return previousPlan(...args)
      }
    }) as F)

    function extraCallDetected() {
      const message = `Unexpected extra call for spec '${currentSpec!.fullName}'`
      fail(message)
      reject(new Error(message))
    }
  })
}

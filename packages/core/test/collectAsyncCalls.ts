import { getCurrentJasmineSpec } from './getCurrentJasmineSpec'

const EXTRA_CALL_GUARD = Symbol('collectAsyncCalls.extraCallGuard')

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
        const guard = (() => {
          extraCallDetected()
        }) as F
        ;(guard as any)[EXTRA_CALL_GUARD] = true
        spy.and.callFake(guard)
        resolve(spy.calls)
      } else if (spy.calls.count() > expectedCallsCount) {
        extraCallDetected()
      }
    }

    checkCalls()

    // Preserve the spy's current behavior (return value, side effects) while
    // adding call-count detection. Jasmine's internal `plan` property holds
    // the function that the spy delegates to.
    const previousPlan: F = (spy.and as unknown as { plan: F }).plan
    const shouldCallPreviousPlan = !(previousPlan as any)[EXTRA_CALL_GUARD]

    spy.and.callFake(((...args: Parameters<F>) => {
      if (shouldCallPreviousPlan) {
        try {
          const result = previousPlan(...args)
          checkCalls()
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return result
        } catch (e) {
          checkCalls()
          throw e
        }
      }
      checkCalls()
    }) as F)

    function extraCallDetected() {
      const message = `Unexpected extra call for spec '${currentSpec!.fullName}'`
      fail(message)
      reject(new Error(message))
    }
  })
}

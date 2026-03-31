import { getCurrentJasmineSpec } from './getCurrentJasmineSpec'
import { registerCleanupTask } from './registerCleanupTask'

const originalPlanForGuard = new WeakMap<() => void, () => void>()

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
        resolve(spy.calls)
      } else if (spy.calls.count() > expectedCallsCount) {
        const message = `Unexpected extra call for spec '${currentSpec.fullName}'`
        fail(message)
        reject(new Error(message))
      }
    }

    checkCalls()

    const originalPlan = getOriginalPlan(spy)
    const guard = ((...args: Parameters<F>) => {
      checkCalls()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return originalPlan(...args)
    }) as F
    originalPlanForGuard.set(guard, originalPlan)
    spy.and.callFake(guard)
    registerCleanupTask(() => {
      spy.and.callFake(originalPlan)
      originalPlanForGuard.delete(guard)
    })
  })
}

function getOriginalPlan<F extends () => void>(spy: jasmine.Spy<F>): F {
  const originalPlanOrGuard: F = (spy.and as unknown as { plan: F }).plan
  return (originalPlanForGuard.get(originalPlanOrGuard) as F | undefined) ?? originalPlanOrGuard
}

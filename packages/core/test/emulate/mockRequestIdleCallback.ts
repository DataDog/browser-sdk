import { registerCleanupTask } from '../registerCleanupTask'

// Arbitrary remaining time for tests that don't care about remaining time
const DEFAULT_TIME_REMAINING = 10

export interface RequestIdleCallbackMock {
  idle(timeRemaining?: number): void
  timeout(): void
  spy: jasmine.Spy<typeof window.requestIdleCallback>
}

export function mockRequestIdleCallback(): RequestIdleCallbackMock {
  let nextId = 1
  const activeIds = new Set<number>()

  const requestSpy = jasmine.createSpy<typeof window.requestIdleCallback>().and.callFake(() => {
    const id = nextId
    activeIds.add(id)
    nextId++
    return id
  })

  const cancelSpy = jasmine.createSpy<typeof window.cancelIdleCallback>().and.callFake((id: number) => {
    activeIds.delete(id)
  })

  const originalRequestIdleCallback = window.requestIdleCallback
  const originalCancelIdleCallback = window.cancelIdleCallback

  window.requestIdleCallback = requestSpy
  window.cancelIdleCallback = cancelSpy
  registerCleanupTask(() => {
    window.requestIdleCallback = originalRequestIdleCallback
    window.cancelIdleCallback = originalCancelIdleCallback
  })

  function callAllActiveCallbacks(deadline: IdleDeadline) {
    for (const call of requestSpy.calls.all().slice()) {
      if (!activeIds.has(call.returnValue)) {
        continue
      }
      activeIds.delete(call.returnValue)
      call.args[0](deadline)
    }
  }

  return {
    idle(timeRemaining = DEFAULT_TIME_REMAINING) {
      const now = Date.now()
      callAllActiveCallbacks({
        didTimeout: false,
        timeRemaining: () => Math.max(0, timeRemaining - (Date.now() - now)),
      })
    },
    timeout() {
      callAllActiveCallbacks({
        didTimeout: true,
        timeRemaining: () => 0,
      })
    },
    spy: requestSpy,
  }
}

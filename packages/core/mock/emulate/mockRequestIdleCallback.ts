import { vi, type MockInstance } from 'vitest'
import { registerCleanupTask } from '../registerCleanupTask'

// Arbitrary remaining time for tests that don't care about remaining time
const DEFAULT_TIME_REMAINING = 10

export interface RequestIdleCallbackMock {
  idle(timeRemaining?: number): void
  timeout(): void
  spy: MockInstance<typeof window.requestIdleCallback>
}

export function mockRequestIdleCallback(): RequestIdleCallbackMock {
  let nextId = 1
  const activeIds = new Set<number>()

  const requestSpy = vi.fn<typeof window.requestIdleCallback>(() => {
    const id = nextId
    activeIds.add(id)
    nextId++
    return id
  })

  const cancelSpy = vi.fn<typeof window.cancelIdleCallback>((id: number) => {
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
    for (const call of requestSpy.mock.calls.slice()) {
      const id = requestSpy.mock.results[requestSpy.mock.calls.indexOf(call)]?.value
      if (!activeIds.has(id)) {
        continue
      }
      activeIds.delete(id)
      call[0](deadline)
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

import { vi } from 'vitest'
import type { Mock } from 'vitest'
import { registerCleanupTask } from '../registerCleanupTask'

// Arbitrary remaining time for tests that don't care about remaining time
const DEFAULT_TIME_REMAINING = 10

export interface RequestIdleCallbackMock {
  idle(timeRemaining?: number): void
  timeout(): void
  spy: Mock<typeof window.requestIdleCallback>
}

export function mockRequestIdleCallback(): RequestIdleCallbackMock {
  let nextId = 1
  const activeIds = new Set<number>()

  const requestSpy = vi.fn<typeof window.requestIdleCallback>().mockImplementation(() => {
    const id = nextId
    activeIds.add(id)
    nextId++
    return id
  })

  const cancelSpy = vi.fn<typeof window.cancelIdleCallback>().mockImplementation((id: number) => {
    activeIds.delete(id)
  })

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalRequestIdleCallback = window.requestIdleCallback
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalCancelIdleCallback = window.cancelIdleCallback

  window.requestIdleCallback = requestSpy
  window.cancelIdleCallback = cancelSpy
  registerCleanupTask(() => {
    window.requestIdleCallback = originalRequestIdleCallback
    window.cancelIdleCallback = originalCancelIdleCallback
  })

  function callAllActiveCallbacks(deadline: IdleDeadline) {
    const { calls, results } = requestSpy.mock
    for (const [index, [callback]] of calls.slice().entries()) {
      const result = results[index]
      if (result.type !== 'return' || !activeIds.has(result.value)) {
        continue
      }
      activeIds.delete(result.value)
      callback(deadline)
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

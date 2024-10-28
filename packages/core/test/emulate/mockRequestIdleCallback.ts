import { registerCleanupTask } from '../registerCleanupTask'

// Arbitrary remaining time for tests that don't care about remaining time
const DEFAULT_TIME_REMAINING = 10

export interface RequestIdleCallbackMock {
  idle(timeRemaining?: number): void
  spy: jasmine.Spy<typeof window.requestIdleCallback>
}

export function mockRequestIdleCallback(): RequestIdleCallbackMock {
  const spy = jasmine.createSpy<typeof window.requestIdleCallback>()

  const originalRequestIdleCallback = window.requestIdleCallback

  window.requestIdleCallback = spy
  registerCleanupTask(() => {
    window.requestIdleCallback = originalRequestIdleCallback
  })

  return {
    idle(timeRemaining = DEFAULT_TIME_REMAINING) {
      const now = Date.now()
      for (const [callback] of spy.calls.allArgs()) {
        callback({ didTimeout: false, timeRemaining: () => Math.max(0, timeRemaining - (Date.now() - now)) })
      }
    },
    spy,
  }
}

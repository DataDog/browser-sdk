import { vi } from 'vitest'
import type { RelativeTime, TimeStamp } from '../../src/tools/utils/timeUtils'
import { registerCleanupTask } from '../registerCleanupTask'

export type Clock = ReturnType<typeof mockClock>

export function mockClock() {
  // Capture navigationStart BEFORE vi.useFakeTimers() — fake timers reset performance.now() to 0
  const timeOrigin = performance.timing.navigationStart // @see getNavigationStart() in timeUtils.ts

  vi.useFakeTimers()
  const timeStampStart = Date.now()
  const relativeStart = timeStampStart - timeOrigin

  // vi.useFakeTimers() resets performance.now() to 0, but the SDK expects
  // performance.now() ≈ Date.now() - navigationStart. Override it directly
  // (not via vi.spyOn which conflicts with restoreMocks).
  const fakePerformanceNow = performance.now
  performance.now = () => Date.now() - timeOrigin

  registerCleanupTask(() => {
    performance.now = fakePerformanceNow
    vi.useRealTimers()
  })

  return {
    /**
     * Returns a RelativeTime representing the time it was X milliseconds after the `mockClock()`
     * invokation (the start of the test).
     */
    relative: (duration: number) => (relativeStart + duration) as RelativeTime,
    /**
     * Returns a TimeStamp representing the time it was X milliseconds after the `mockClock()`
     * invokation (the start of the test).
     */
    timeStamp: (duration: number) => (timeStampStart + duration) as TimeStamp,
    tick: (ms: number) => vi.advanceTimersByTime(ms),
    setDate: (date: Date) => vi.setSystemTime(date),
  }
}

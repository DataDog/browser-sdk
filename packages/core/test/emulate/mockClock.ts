import { vi } from 'vitest'
import type { RelativeTime, TimeStamp } from '../../src/tools/utils/timeUtils'
import { registerCleanupTask } from '../registerCleanupTask'

export type Clock = ReturnType<typeof mockClock>

export function mockClock() {
  vi.useFakeTimers()

  const timeOrigin = performance.timing.navigationStart // @see getNavigationStart() in timeUtils.ts
  const timeStampStart = Date.now()
  const relativeStart = timeStampStart - timeOrigin

  // Note: vi.useFakeTimers() already mocks performance.now() — no separate spy needed.
  // Adding vi.spyOn on top would conflict with restoreMocks, which restores the spy to a
  // stale fake timer implementation after vi.useRealTimers() has already cleaned up.

  registerCleanupTask(() => vi.useRealTimers())

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

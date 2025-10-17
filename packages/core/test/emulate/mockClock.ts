import { vi } from 'vitest'
import type { RelativeTime, TimeStamp } from '../../src/tools/utils/timeUtils'
import { registerCleanupTask } from '../registerCleanupTask'

export type Clock = ReturnType<typeof mockClock>

export function mockClock() {
  vi.useFakeTimers()
  const timeOrigin = performance.timing.navigationStart // @see getNavigationStart() in timeUtils.ts
  const timeStampStart = Date.now()
  const relativeStart = timeStampStart - timeOrigin

  vi.spyOn(performance, 'now').mockImplementation(() => Date.now() - timeOrigin)

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

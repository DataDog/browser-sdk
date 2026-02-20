import { vi } from 'vitest'
import type { RelativeTime, TimeStamp } from '../../src/tools/utils/timeUtils'
import { registerCleanupTask } from '../registerCleanupTask'

export type Clock = ReturnType<typeof mockClock>

export function mockClock() {
  // Use performance.timing.navigationStart as timeOrigin — it's an integer set once
  // at page load, so it doesn't suffer from timing races between performance.now()
  // and Date.now() captures. This matches getNavigationStart() in timeUtils.ts.
  const timeOrigin = performance.timing.navigationStart

  // Exclude 'performance' from faking so our override sticks on the real object
  // AND so performance.timing.navigationStart remains accessible.
  // When performance IS faked, @sinonjs/fake-timers replaces the object and our
  // override silently fails (the fake performance.now() starts at 0).
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  })

  // Capture Date.now() AFTER vi.useFakeTimers() to get the exact frozen value.
  const timeStampStart = Date.now()
  const relativeStart = timeStampStart - timeOrigin

  const originalPerfNow = performance.now.bind(performance)
  performance.now = () => Date.now() - timeOrigin

  registerCleanupTask(() => {
    performance.now = originalPerfNow
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
    // Wrap tick() to return void — vi.advanceTimersByTime returns the Vi instance,
    // which breaks React useEffect cleanup that expects void.
    tick: (ms: number) => {
      vi.advanceTimersByTime(ms)
    },
    setDate: (date: Date) => vi.setSystemTime(date),
  }
}

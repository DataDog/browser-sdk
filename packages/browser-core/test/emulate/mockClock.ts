import type { RelativeTime, TimeStamp } from '../../src/tools/utils/timeUtils'
import { registerCleanupTask } from '../registerCleanupTask'

export type Clock = ReturnType<typeof mockClock>

export function mockClock() {
  jasmine.clock().install()
  jasmine.clock().mockDate()

  const timeOrigin = performance.timing.navigationStart // @see getNavigationStart() in timeUtils.ts
  const timeStampStart = Date.now()
  const relativeStart = timeStampStart - timeOrigin

  spyOn(performance, 'now').and.callFake(() => Date.now() - timeOrigin)

  registerCleanupTask(() => jasmine.clock().uninstall())

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
    tick: (ms: number) => jasmine.clock().tick(ms),
    setDate: (date: Date) => jasmine.clock().mockDate(date),
  }
}

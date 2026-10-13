import type { TimeStamp, RelativeTime } from '@datadog/js-core/time'
import { registerCleanupTask } from '../registerCleanupTask'

export type Clock = ReturnType<typeof mockClock>

export function mockClock() {
  jasmine.clock().install()
  jasmine.clock().mockDate()

  const timeOrigin = performance.timing.navigationStart // @see getTimeOrigin() in @datadog/js-core/time
  const timeStampStart = Date.now()
  const relativeStart = timeStampStart - timeOrigin

  // how far the system clock was moved away from the monotonic clock by `jumpSystemClock()`
  let systemClockShift = 0

  spyOn(performance, 'now').and.callFake(() => Date.now() - timeOrigin - systemClockShift)

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
    /**
     * Moves the system clock (`Date.now()`) by X milliseconds, forward or back, while
     * `performance.now()` carries on unaffected — as an NTP step or a manual clock change would.
     * `relative()` and `timeStamp()` keep ignoring the jump.
     */
    jumpSystemClock: (ms: number) => {
      systemClockShift += ms
      jasmine.clock().mockDate(new Date(Date.now() + ms))
    },
  }
}

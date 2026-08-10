import type { TimeStamp, RelativeTime } from '@datadog/js-core/time'
import { queueMicrotask } from '../../src/tools/queueMicrotask'
import { registerCleanupTask } from '../registerCleanupTask'
import { replaceMockable } from '../replaceMockable'

export type Clock = ReturnType<typeof mockClock>

export function mockClock() {
  jasmine.clock().install()
  jasmine.clock().mockDate()

  const timeOrigin = performance.timing.navigationStart // @see getTimeOrigin() in @datadog/js-core/time
  const timeStampStart = Date.now()
  const relativeStart = timeStampStart - timeOrigin

  spyOn(performance, 'now').and.callFake(() => Date.now() - timeOrigin)

  registerCleanupTask(() => jasmine.clock().uninstall())

  const pendingMicroTasks: Array<() => void> = []
  replaceMockable(queueMicrotask, (callback) => {
    pendingMicroTasks.push(callback)
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
    tick: (ms: number) => {
      pendingMicroTasks.splice(0).forEach((task) => task())
      jasmine.clock().tick(ms)
    },
    setDate: (date: Date) => jasmine.clock().mockDate(date),
  }
}

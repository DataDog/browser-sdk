import { resetNavigationStart } from '../../src/tools/utils/timeUtils'
import { registerCleanupTask } from '../registerCleanupTask'

export type Clock = {
  tick: (ms: number) => void
  setDate: (date: Date) => void
}

export function mockClock(beforeCleanup?: () => void): Clock {
  jasmine.clock().install()
  jasmine.clock().mockDate()
  const start = Date.now()
  spyOn(performance, 'now').and.callFake(() => Date.now() - start)
  spyOnProperty(performance.timing, 'navigationStart', 'get').and.callFake(() => start)
  resetNavigationStart()

  registerCleanupTask(() => {
    if (beforeCleanup) {
      beforeCleanup()
    }
    jasmine.clock().uninstall()
    resetNavigationStart()
  })

  return {
    tick: (ms: number) => jasmine.clock().tick(ms),
    setDate: (date: Date) => jasmine.clock().mockDate(date),
  }
}

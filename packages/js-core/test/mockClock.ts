import { registerCleanupTask } from './registerCleanupTask'

export type Clock = ReturnType<typeof mockClock>

export function mockClock() {
  jasmine.clock().install()
  jasmine.clock().mockDate()
  registerCleanupTask(() => jasmine.clock().uninstall())
  return {
    tick: (ms: number) => jasmine.clock().tick(ms),
  }
}

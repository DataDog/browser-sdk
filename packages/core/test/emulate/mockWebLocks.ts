import { registerCleanupTask } from '../registerCleanupTask'

// Mock Web Locks API to make session operations synchronous in tests
export function mockWebLocksForSyncExecution() {
  const originalLocks = navigator.locks
  const mockLocks = {
    request: (_name: string, _options: LockOptions, callback: () => void) => {
      callback()
      return Promise.resolve()
    },
  }

  Object.defineProperty(navigator, 'locks', {
    value: mockLocks,
    writable: true,
    configurable: true,
  })

  registerCleanupTask(() => {
    Object.defineProperty(navigator, 'locks', {
      value: originalLocks,
      writable: true,
      configurable: true,
    })
  })
}

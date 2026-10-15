import { registerCleanupTask } from '@datadog/browser-core/test'
import type { TrackedConnection } from './trackedConnection'
import { hasOpenConnection, trackedConnections } from './trackedConnections'

describe('trackedConnections', () => {
  beforeEach(() => {
    registerCleanupTask(() => {
      trackedConnections.clear()
    })
  })

  describe('hasOpenConnection', () => {
    it('should return false when no connection is tracked', () => {
      expect(hasOpenConnection()).toBe(false)
    })

    it('should return false when no connection is open', () => {
      trackedConnections.set({} as WebSocket, createFakeConnection(false))
      trackedConnections.set({} as WebSocket, createFakeConnection(false))

      expect(hasOpenConnection()).toBe(false)
    })

    it('should return true when at least one connection is open', () => {
      trackedConnections.set({} as WebSocket, createFakeConnection(false))
      trackedConnections.set({} as WebSocket, createFakeConnection(true))

      expect(hasOpenConnection()).toBe(true)
    })

    it('should return false once the open connection is deleted', () => {
      const instance = {} as WebSocket
      trackedConnections.set(instance, createFakeConnection(true))

      trackedConnections.delete(instance)

      expect(hasOpenConnection()).toBe(false)
    })
  })
})

function createFakeConnection(isOpen: boolean): TrackedConnection {
  return {
    isOpen: () => isOpen,
  } as TrackedConnection
}

import type { TrackedConnection } from './trackedConnection'

export const trackedConnections = new Map<WebSocket, TrackedConnection>()

export function hasOpenConnection() {
  for (const connection of trackedConnections.values()) {
    if (connection.isOpen()) {
      return true
    }
  }
  return false
}

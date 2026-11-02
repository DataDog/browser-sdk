import { addTelemetryDebug } from '@datadog/browser-core'
import type { LifeCycle } from '../lifeCycle'
import { emitWebSocketVital } from './emitWebSocketVital'
import type { TrackedConnection, TrackedConnectionState } from './trackedConnection'

export interface EarlyConnectionsBuffer {
  // It might refuse to register a new connecting WebSocket then returns false; true otherwise.
  register: (instance: WebSocket, connection: TrackedConnection) => boolean
  drain: (lifeCycle: LifeCycle) => void
  clear: () => void
}

/**
 * Caps connections opened before init.
 *
 * It bounds the memory held until drain, and the work drain does on the main thread: drain emits
 * every buffered phase synchronously.
 *
 * Opening many sockets at once is not a typical case. 8 is arbitrary: small enough to stay cheap,
 * large enough for the cases we expect. Dropped connections are reported with debug telemetry, so
 * the limit can be raised, or an eviction added, if that count says so.
 */
export const BUFFER_CAPACITY = 8

export function createEarlyConnectionsBuffer(): EarlyConnectionsBuffer {
  const earlyConnections = new Map<WebSocket, TrackedConnectionState[]>()
  let droppedConnectionCount = 0

  const register = (instance: WebSocket, connection: TrackedConnection): boolean => {
    const state = connection.getState()

    switch (state.phase) {
      case 'connecting':
        if (earlyConnections.size >= BUFFER_CAPACITY) {
          droppedConnectionCount++
          return false
        }

        earlyConnections.set(instance, [state])
        break
      case 'open': {
        const instanceStates = earlyConnections.get(instance)
        if (!instanceStates) {
          return true
        }

        // only a connecting state creates an entry, so it always sits at index 0 and the open state at index 1
        instanceStates[1] = state

        break
      }
      default: {
        const instanceStates = earlyConnections.get(instance)
        if (!instanceStates) {
          return true
        }

        instanceStates.push(state)

        break
      }
    }

    return true
  }

  const clear = (): void => {
    earlyConnections.clear()
    droppedConnectionCount = 0
  }

  const drain = (lifeCycle: LifeCycle): void => {
    earlyConnections.forEach((states, instance) => {
      states.forEach((state) => emitWebSocketVital(lifeCycle, instance, state))
    })

    if (droppedConnectionCount > 0) {
      // monitor-until: 2026-12-15
      addTelemetryDebug('Dropped early connections, buffer is full', {
        count: droppedConnectionCount,
        capacity: BUFFER_CAPACITY,
      })
    }

    clear()
  }

  return { register, drain, clear }
}

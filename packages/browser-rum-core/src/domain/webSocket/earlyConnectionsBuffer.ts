import { addTelemetryDebug } from '@datadog/browser-core'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { getPhaseClocks, serializeWebSocketVital } from './serializeWebSocketVital'
import type { TrackedConnection, TrackedConnectionState } from './trackedConnection'

export interface EarlyConnectionsBuffer {
  // It might refuse to register a new connecting WebSocket then returns false; true otherwise.
  register: (instance: WebSocket, connection: TrackedConnection) => boolean
  drain: (lifeCycle: LifeCycle) => void
  clear: () => void
}

export const BUFFER_CAPACITY = 8

let earlyConnectionsBuffer: EarlyConnectionsBuffer | undefined

export function initEarlyConnectionsBuffer(): EarlyConnectionsBuffer {
  if (earlyConnectionsBuffer) {
    return earlyConnectionsBuffer
  }

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
      states.forEach((state) => {
        lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
          rawRumEvent: serializeWebSocketVital(state),
          startClocks: getPhaseClocks(state),
          domainContext: { webSocket: instance },
        })
      })
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

  earlyConnectionsBuffer = { register, drain, clear }

  return earlyConnectionsBuffer
}

export function resetEarlyConnectionsBuffer() {
  earlyConnectionsBuffer?.clear()
  earlyConnectionsBuffer = undefined
}

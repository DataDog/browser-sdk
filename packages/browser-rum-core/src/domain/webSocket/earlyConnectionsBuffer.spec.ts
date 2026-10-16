import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask, startMockTelemetry } from '@datadog/browser-core/test'
import { relativeToClocks } from '@datadog/js-core/time'
import type { RawRumWebSocketVitalEvent } from '../../rawRumEvent.types'
import { WebSocketVitalName } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { EarlyConnectionsBuffer } from './earlyConnectionsBuffer'
import { initEarlyConnectionsBuffer, resetEarlyConnectionsBuffer } from './earlyConnectionsBuffer'
import type { TrackedConnection } from './trackedConnection'
import { createTrackedConnection } from './trackedConnection'
import { closedContext, closingContext, connectingContext, openContext } from './webSocketContexts.specHelper'

describe('earlyConnectionsBuffer', () => {
  let clock: Clock
  let buffer: EarlyConnectionsBuffer
  let lifeCycle: LifeCycle
  let collectedEvents: Array<RawRumEventCollectedData<RawRumWebSocketVitalEvent>>

  beforeEach(() => {
    clock = mockClock()
    buffer = initEarlyConnectionsBuffer()
    lifeCycle = new LifeCycle()
    collectedEvents = []
    lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (data) => {
      collectedEvents.push(data as RawRumEventCollectedData<RawRumWebSocketVitalEvent>)
    })

    // the buffer is module-wide, so whatever a spec leaves in it would leak into the next one
    registerCleanupTask(resetEarlyConnectionsBuffer)
  })

  describe('drain', () => {
    it('should emit nothing when no connection was registered', () => {
      buffer.drain(lifeCycle)

      expect(collectedEvents).toEqual([])
    })

    it('should emit every state registered for a connection, in phase order', () => {
      const instance = {} as WebSocket
      const connection = registerConnecting(instance, 0)
      registerOpen(instance, connection, 10)
      registerClosing(instance, connection, 20)
      registerClosed(instance, connection, 30)

      buffer.drain(lifeCycle)

      expect(collectedEvents.map((event) => event.rawRumEvent.vital.name)).toEqual([
        WebSocketVitalName.CONNECTING,
        WebSocketVitalName.OPEN,
        WebSocketVitalName.CLOSING,
        WebSocketVitalName.CLOSED,
      ])
    })

    it('should emit only the last open state of a connection that registered several', () => {
      const instance = {} as WebSocket
      const connection = registerConnecting(instance, 0)
      registerOpen(instance, connection, 10)
      registerReport(instance, connection, 20)
      registerReport(instance, connection, 30)

      buffer.drain(lifeCycle)

      expect(collectedEvents.map((event) => event.rawRumEvent.vital.name)).toEqual([
        WebSocketVitalName.CONNECTING,
        WebSocketVitalName.OPEN,
      ])
      expect(collectedEvents[1].startClocks).toEqual(clocksAt(30))
    })

    it('should ignore the open state of a connection whose connecting state was not registered', () => {
      const instance = {} as WebSocket
      const connection = createConnecting(instance, 0)
      registerOpen(instance, connection, 10)

      buffer.drain(lifeCycle)

      expect(collectedEvents).toEqual([])
    })

    it('should emit the states of every registered connection', () => {
      const firstInstance = {} as WebSocket
      const secondInstance = {} as WebSocket
      const firstConnection = registerConnecting(firstInstance, 0)
      const secondConnection = registerConnecting(secondInstance, 5)
      registerOpen(firstInstance, firstConnection, 10)

      buffer.drain(lifeCycle)

      expect(collectedEvents.map((event) => event.rawRumEvent.vital.websocket.id)).toEqual([
        firstConnection.getState().id,
        firstConnection.getState().id,
        secondConnection.getState().id,
      ])
    })

    it('should date each vital at the clocks of the phase it reports', () => {
      const instance = {} as WebSocket
      const connection = registerConnecting(instance, 0)
      registerOpen(instance, connection, 10)

      buffer.drain(lifeCycle)

      expect(collectedEvents.map((event) => event.startClocks)).toEqual([clocksAt(0), clocksAt(10)])
    })

    it('should attach the WebSocket instance as domain context', () => {
      const instance = {} as WebSocket
      registerConnecting(instance, 0)

      buffer.drain(lifeCycle)

      expect(collectedEvents[0].domainContext).toEqual({ webSocket: instance })
    })

    it('should empty the buffer, so a later drain emits nothing', () => {
      const instance = {} as WebSocket
      registerConnecting(instance, 0)
      buffer.drain(lifeCycle)
      collectedEvents = []

      buffer.drain(lifeCycle)

      expect(collectedEvents).toEqual([])
    })
  })

  describe('dropped connections telemetry', () => {
    it('should report how many connections were dropped once, at drain', async () => {
      const telemetry = startMockTelemetry()
      fillBuffer()
      registerConnecting({} as WebSocket, 0)
      registerConnecting({} as WebSocket, 0)

      expect(await telemetry.hasEvents()).toBe(false)

      buffer.drain(lifeCycle)

      expect(await telemetry.getEvents()).toEqual([
        jasmine.objectContaining({
          status: 'debug',
          message: 'Dropped early connections, buffer is full',
          count: 2,
        }),
      ])
    })

    it('should not report when no connection was dropped', async () => {
      const telemetry = startMockTelemetry()
      fillBuffer()

      buffer.drain(lifeCycle)

      expect(await telemetry.hasEvents()).toBe(false)
    })

    it('should reset the count on clear', async () => {
      const telemetry = startMockTelemetry()
      fillBuffer()
      registerConnecting({} as WebSocket, 0)
      buffer.clear()

      buffer.drain(lifeCycle)

      expect(await telemetry.hasEvents()).toBe(false)
    })
  })

  describe('beyond capacity', () => {
    it('should refuse a connection', () => {
      fillBuffer()
      const instance = {} as WebSocket

      expect(buffer.register(instance, createConnecting(instance, 0))).toBe(false)
    })

    it('should not emit the states of a refused connection', () => {
      fillBuffer()
      const instance = {} as WebSocket
      const connection = registerConnecting(instance, 0)

      registerOpen(instance, connection, 10)
      buffer.drain(lifeCycle)

      expect(collectedEvents.map((event) => event.rawRumEvent.vital.websocket.id)).not.toContain(
        connection.getState().id
      )
    })
  })

  function fillBuffer() {
    for (let i = 0; i < 8; i++) {
      registerConnecting({} as WebSocket, 0)
    }
  }

  function clocksAt(relative: number) {
    return relativeToClocks(clock.relative(relative))
  }

  function createConnecting(instance: WebSocket, at: number) {
    return createTrackedConnection(connectingContext(instance, clocksAt(at)))
  }

  function registerConnecting(instance: WebSocket, at: number) {
    const connection = createConnecting(instance, at)
    buffer.register(instance, connection)
    return connection
  }

  function registerOpen(instance: WebSocket, connection: TrackedConnection, at: number) {
    connection.recordOpen(openContext(instance, clocksAt(at)))
    buffer.register(instance, connection)
  }

  function registerReport(instance: WebSocket, connection: TrackedConnection, at: number) {
    connection.recordReport(clocksAt(at))
    buffer.register(instance, connection)
  }

  function registerClosing(instance: WebSocket, connection: TrackedConnection, at: number) {
    connection.recordClosing(closingContext(instance, clocksAt(at)))
    buffer.register(instance, connection)
  }

  function registerClosed(instance: WebSocket, connection: TrackedConnection, at: number) {
    connection.recordClose(closedContext(instance, clocksAt(at)))
    buffer.register(instance, connection)
  }
})

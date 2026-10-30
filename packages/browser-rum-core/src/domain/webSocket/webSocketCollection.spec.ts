import { addExperimentalFeatures, ExperimentalFeature, PageExitReason } from '@datadog/browser-core'
import { resetAllowUntrustedEvents, setAllowUntrustedEvents } from '@datadog/js-core/dom'
import {
  createMockWebSocket,
  mockClock,
  mockWebSocket,
  registerCleanupTask,
  startMockTelemetry,
  waitNextMicrotask,
  type Clock,
  type MockWebSocket,
} from '@datadog/browser-core/test'
import type { Duration } from '@datadog/js-core/time'
import { clocksNow, ONE_HOUR, ONE_MINUTE, toServerDuration } from '@datadog/js-core/time'
import { globalObject, noop } from '@datadog/js-core/util'
import { mockRumConfiguration, noopEarlyWebSocketCollection } from '../../../test'
import { initWebSocketObservable } from '../../browser/webSocketObservable'
import type { RumWebSocketVitalEventDomainContext } from '../../domainContext.types'
import type {
  RawRumWebSocketClosedVitalProperties,
  RawRumWebSocketClosingVitalProperties,
  RawRumWebSocketConnectingVitalProperties,
  RawRumWebSocketOpenVitalProperties,
  RawRumWebSocketVitalEvent,
} from '../../rawRumEvent.types'
import { RumEventType, VitalType, WebSocketTrackingEndReason, WebSocketVitalName } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { emitWebSocketVital } from './emitWebSocketVital'
import type { EarlyWebSocketCollection } from './webSocketCollection'
import {
  EARLY_PHASES_BUFFER_CAPACITY,
  resetTrackedConnections,
  startEarlyWebSocketCollection,
  startWebSocketCollection,
  trackWebSocket,
  WEBSOCKET_PERIODIC_REPORT_INTERVAL,
} from './webSocketCollection'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('webSocketCollection', () => {
  let lifeCycle: LifeCycle
  let collectedEvents: Array<RawRumEventCollectedData<RawRumWebSocketVitalEvent>>
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    mockWebSocket()
    // the mock socket dispatches untrusted events, which the SDK listeners would otherwise ignore
    setAllowUntrustedEvents(true)
    lifeCycle = new LifeCycle()
    collectedEvents = []
    lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (data) => {
      if (data.rawRumEvent.type === RumEventType.VITAL && data.rawRumEvent.vital.type === VitalType.WEBSOCKET) {
        collectedEvents.push(data as RawRumEventCollectedData<RawRumWebSocketVitalEvent>)
      }
    })
    registerCleanupTask(resetAllowUntrustedEvents)
  })

  describe('connection identity', () => {
    it('reports every vital of a connection under one connection id, and each under a fresh vital id', () => {
      startTracking()
      const socket = createConnectingConnection()
      completeHandshake(socket, { at: 10 })
      dispatchClose(socket, { at: 20 })

      const vitals = emittedVitals()
      const connectionId = single(connectingPayloads()).id
      expect(vitals.map((event) => event.rawRumEvent.vital.name)).toEqual([
        WebSocketVitalName.CONNECTING,
        WebSocketVitalName.OPEN,
        WebSocketVitalName.CLOSED,
      ])
      expect(connectionId).toMatch(UUID_PATTERN)
      expect(vitals.map((event) => event.rawRumEvent.vital.websocket.id)).toEqual([
        connectionId,
        connectionId,
        connectionId,
      ])

      const vitalIds = vitals.map((event) => event.rawRumEvent.vital.id)
      vitalIds.forEach((vitalId) => expect(vitalId).toMatch(UUID_PATTERN))
      expect(new Set([...vitalIds, connectionId]).size).toBe(vitals.length + 1)
    })

    it('tracks overlapping connections independently, and never merges them', () => {
      startTracking()
      const socketA = createOpenConnection({ at: 0 })
      const socketB = createOpenConnection({ at: 10 })
      const [idA, idB] = connectingPayloads().map((payload) => payload.id)

      dispatchClose(socketA, { at: 30 })

      expect(idA).not.toBe(idB)
      expect(closedPayloads().map((payload) => payload.id)).toEqual([idA])

      dispatchClose(socketB, { at: 40 })

      expect(closedPayloads().map((payload) => payload.id)).toEqual([idA, idB])
    })

    it('ignores every event of a socket it did not see being created', () => {
      // keeps the instrumentation in place while the socket is created, as it would be for a socket
      // the application created before the collection started
      const otherSubscription = initWebSocketObservable().subscribe(noop)
      registerCleanupTask(() => otherSubscription.unsubscribe())
      const socket = createConnectingConnection()

      startTracking()
      completeHandshake(socket)
      sendMessage(socket, 10)
      receiveMessage(socket, 10)
      callClose(socket)
      dispatchClose(socket)
      tickPeriodicReport()

      expect(emittedVitals()).toHaveSize(0)
    })
  })

  // They are what the vital is attributed to a view by, so a closed vital lands on the view that
  // was active when the connection ended rather than on the one it started in.
  describe('the start clocks each vital is handed over with', () => {
    it('are the moment the phase it reports happened', () => {
      startTracking()
      const socket = createConnectingConnection({ at: 5 })
      completeHandshake(socket, { at: 10 })
      tickPeriodicReport()
      callClose(socket, { at: WEBSOCKET_PERIODIC_REPORT_INTERVAL + 20 })
      dispatchClose(socket, { at: WEBSOCKET_PERIODIC_REPORT_INTERVAL + 30 })

      expect(emittedVitals().map((event) => event.startClocks.timeStamp)).toEqual([
        clock.timeStamp(5),
        clock.timeStamp(10),
        clock.timeStamp(WEBSOCKET_PERIODIC_REPORT_INTERVAL + 10),
        clock.timeStamp(WEBSOCKET_PERIODIC_REPORT_INTERVAL + 20),
        clock.timeStamp(WEBSOCKET_PERIODIC_REPORT_INTERVAL + 30),
      ])
    })

    it('are the flush date for a connection a flush finalized', () => {
      const tracker = startTracking()
      createOpenConnection()
      advanceTo(40)

      tracker.flushOpenConnections()

      expect(single(emittedVitals(WebSocketVitalName.CLOSED)).startClocks.timeStamp).toBe(clock.timeStamp(40))
    })
  })

  describe('the connecting vital', () => {
    it('is emitted synchronously from the constructor, dated at the call', () => {
      startTracking()

      createConnectingConnection({ at: 40 })

      expect(single(connectingPayloads()).connecting_date).toBe(clock.timeStamp(40))
    })

    it('reports the URL stripped of its query string, including from an encoded path', () => {
      startTracking()
      createConnectingConnection({ url: 'wss://example.com:8443/path/socket%3Froom?token=secret&tenant=acme' })

      expect(single(connectingPayloads()).url).toBe('wss://example.com:8443/path/socket%3Froom')
    })

    it('reports a single requested protocol as a list of one', () => {
      startTracking()
      createConnectingConnection({ protocols: 'auth-token' })

      expect(single(connectingPayloads()).requested_protocols).toEqual(['auth-token'])
    })

    it('reports the requested protocols in the order they were requested', () => {
      startTracking()
      createConnectingConnection({ protocols: ['auth-token', 'chat.v1'] })

      expect(single(connectingPayloads()).requested_protocols).toEqual(['auth-token', 'chat.v1'])
    })

    it('reports no requested protocols when the constructor got none', () => {
      startTracking()
      createConnectingConnection()

      expect(single(connectingPayloads()).requested_protocols).toBeUndefined()
    })
  })

  describe('the open vital', () => {
    it('is emitted on the open event, dated at it and carrying the first snapshot version', () => {
      startTracking()
      const socket = createConnectingConnection()

      completeHandshake(socket, { at: 10 })

      const open = single(openPayloads())
      expect(open.open_date).toBe(clock.timeStamp(10))
      expect(open.snapshot_version).toBe(1)
    })

    it('reports what the server negotiated', () => {
      startTracking()
      const socket = createConnectingConnection()

      completeHandshake(socket, { protocol: 'chat.v1', extensions: 'permessage-deflate' })

      expect(single(openPayloads()).selected_protocol).toBe('chat.v1')
      expect(single(openPayloads()).selected_extensions).toBe('permessage-deflate')
    })

    it('reports no negotiated protocol or extensions when the server selected none', () => {
      startTracking()
      const socket = createConnectingConnection()

      completeHandshake(socket, { protocol: '', extensions: '' })

      expect(single(openPayloads()).selected_protocol).toBeUndefined()
      expect(single(openPayloads()).selected_extensions).toBeUndefined()
    })

    it('is not emitted at all for a handshake that never succeeded', () => {
      startTracking()
      const socket = createConnectingConnection()

      failHandshake(socket)

      expect(emittedVitals().map((event) => event.rawRumEvent.vital.name)).toEqual([
        WebSocketVitalName.CONNECTING,
        WebSocketVitalName.CLOSED,
      ])
    })
  })

  // One flat cadence in every page state, so that a connection held open for an hour is visible
  // while it is open, and one that dies without closing still reports the traffic its last report
  // carried.
  describe('the periodic report of open connections', () => {
    /**
     * Watches the intervals scheduled at the periodic report cadence, which is the only way to tell
     * a periodic report that was never scheduled from one that emits nothing. The global is patched
     * by hand rather than spied on so that the mocked clock's own teardown, which runs after this
     * one, restores the real timers.
     */
    function watchPeriodicReportTimer() {
      const originalSetInterval = globalObject.setInterval
      const originalClearInterval = globalObject.clearInterval
      const pendingIds = new Set<unknown>()
      let scheduledCount = 0

      globalObject.setInterval = (handler: TimerHandler, timeout?: number) => {
        const intervalId = originalSetInterval(handler, timeout)
        if (timeout === WEBSOCKET_PERIODIC_REPORT_INTERVAL) {
          scheduledCount += 1
          pendingIds.add(intervalId)
        }
        return intervalId
      }
      globalObject.clearInterval = (intervalId?: number) => {
        pendingIds.delete(intervalId)
        originalClearInterval(intervalId)
      }

      registerCleanupTask(() => {
        globalObject.setInterval = originalSetInterval
        globalObject.clearInterval = originalClearInterval
      })

      return {
        isScheduled: () => pendingIds.size > 0,
        scheduledCount: () => scheduledCount,
      }
    }

    it('schedules one shared timer, and only while a connection is in phase open', () => {
      const timer = watchPeriodicReportTimer()
      startTracking()

      expect(timer.isScheduled()).toBe(false)

      const socketA = createOpenConnection()
      const socketB = createOpenConnection()

      expect(timer.isScheduled()).toBe(true)
      expect(timer.scheduledCount()).toBe(1)

      dispatchClose(socketA)

      expect(timer.isScheduled()).toBe(true)

      dispatchClose(socketB)

      expect(timer.isScheduled()).toBe(false)
    })

    it('schedules the timer again when a connection opens after the last one closed', () => {
      const timer = watchPeriodicReportTimer()
      startTracking()
      dispatchClose(createOpenConnection())

      createOpenConnection()
      tickPeriodicReport()

      expect(timer.isScheduled()).toBe(true)
      expect(timer.scheduledCount()).toBe(2)
      expect(openPayloads().map((payload) => payload.snapshot_version)).toEqual([1, 1, 2])
    })

    it('emits a report for an open connection once per interval, each report carrying the next snapshot version', () => {
      startTracking()
      createOpenConnection()

      tickPeriodicReport(3)

      expect(openPayloads().map((payload) => payload.snapshot_version)).toEqual([1, 2, 3, 4])
    })

    it('dates every report at the emit, while still reporting the date the handshake completed', () => {
      startTracking()
      createOpenConnection()

      tickPeriodicReport(2)

      expect(emittedVitals(WebSocketVitalName.OPEN).map((event) => event.rawRumEvent.date)).toEqual([
        clock.timeStamp(0),
        clock.timeStamp(WEBSOCKET_PERIODIC_REPORT_INTERVAL),
        clock.timeStamp(2 * WEBSOCKET_PERIODIC_REPORT_INTERVAL),
      ])
      expect(openPayloads().map((payload) => payload.open_date)).toEqual([
        clock.timeStamp(0),
        clock.timeStamp(0),
        clock.timeStamp(0),
      ])
    })

    it('carries on each report everything exchanged since the connection opened', () => {
      startTracking()
      const socket = createOpenConnection()

      tickPeriodicReport()
      receiveMessage(socket, 30)
      tickPeriodicReport()

      expect(openPayloads()[1].snapshot.inbound.message_count).toBe(0)
      expect(openPayloads()[2].snapshot.inbound).toEqual(
        jasmine.objectContaining({ message_count: 1, message_size_total: 30 })
      )
    })

    it('emits a report for every open connection on the same tick', () => {
      startTracking()
      createOpenConnection()
      createOpenConnection()

      tickPeriodicReport()

      const [idA, idB] = connectingPayloads().map((payload) => payload.id)
      expect(openPayloads().map((payload) => payload.id)).toEqual([idA, idB, idA, idB])
    })

    it('closes each report snapshot at the report date even when an earlier emit is delayed', () => {
      startTracking()
      createOpenConnection()
      const socketB = createOpenConnection()
      receiveMessage(socketB, 1)

      // a slow delivery path on the first connection of the report: time moves on before the next
      // connection is read, which is what would stretch longest_silence past the report date if the
      // snapshot closed at relativeNow() rather than at reportClocks. setDate (not tick) so we do not
      // re-enter the periodic report timer from inside its own handler.
      const delayMs = 5_000
      let delayedOnce = false
      lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, () => {
        if (!delayedOnce) {
          delayedOnce = true
          clock.setDate(new Date(Date.now() + delayMs))
        }
      })

      tickPeriodicReport()

      const [, idB] = connectingPayloads().map((payload) => payload.id)
      const reportVitalOfB = emittedVitals(WebSocketVitalName.OPEN).find(
        (event) =>
          event.rawRumEvent.vital.websocket.id === idB &&
          (event.rawRumEvent.vital.websocket as RawRumWebSocketOpenVitalProperties).snapshot_version === 2
      )!
      const reportPayloadOfB = reportVitalOfB.rawRumEvent.vital.websocket as {
        id: string
      } & RawRumWebSocketOpenVitalProperties

      expect(reportVitalOfB.rawRumEvent.date).toBe(clock.timeStamp(WEBSOCKET_PERIODIC_REPORT_INTERVAL))
      expect(reportPayloadOfB.snapshot.inbound.longest_silence).toBe(
        toServerDuration(WEBSOCKET_PERIODIC_REPORT_INTERVAL as Duration)
      )
    })

    it('does not emit a report for a connection whose handshake has not completed', () => {
      startTracking()
      createConnectingConnection()

      tickPeriodicReport(2)

      expect(openPayloads()).toHaveSize(0)
    })

    it('stops emitting reports for a connection once close() started the closing handshake', () => {
      startTracking()
      const socket = createOpenConnection()
      tickPeriodicReport()

      callClose(socket)
      tickPeriodicReport(2)

      expect(openPayloads()).toHaveSize(2)
    })

    it('stops emitting reports once the last open connection closed', () => {
      startTracking()
      const socket = createOpenConnection()

      dispatchClose(socket)
      tickPeriodicReport(3)

      expect(openPayloads()).toHaveSize(1)
    })

    it('keeps emitting reports for the connections still open when one of them closes', () => {
      startTracking()
      const socketA = createOpenConnection()
      createOpenConnection()

      dispatchClose(socketA)
      tickPeriodicReport()

      const [, idB] = connectingPayloads().map((payload) => payload.id)
      expect(openPayloads().filter((payload) => payload.id === idB)).toHaveSize(2)
      expect(openPayloads()).toHaveSize(3)
    })

    it('stops emitting reports for the connections a flush finalized', () => {
      const tracker = startTracking()
      createOpenConnection()

      tracker.flushOpenConnections()
      tickPeriodicReport(3)

      expect(openPayloads()).toHaveSize(1)
    })

    it('stops emitting reports after stop()', () => {
      const tracker = startTracking()
      createOpenConnection()

      tracker.stop()
      tickPeriodicReport(3)

      expect(openPayloads()).toHaveSize(1)
    })

    // Expected rather than guarded against: one shared timer serves every connection, and both
    // snapshot versions are correct and ordered.
    it('emits two reports for a connection that opened just before a tick, with ordered versions', () => {
      startTracking()
      createOpenConnection()
      createOpenConnection({ at: WEBSOCKET_PERIODIC_REPORT_INTERVAL - 1 })

      advanceTo(WEBSOCKET_PERIODIC_REPORT_INTERVAL)

      const [, lateId] = connectingPayloads().map((payload) => payload.id)
      expect(
        openPayloads()
          .filter((payload) => payload.id === lateId)
          .map((payload) => payload.snapshot_version)
      ).toEqual([1, 2])
    })
  })

  describe('the closing vital', () => {
    it('is emitted on the close() call, carrying the closing date and the client as the initiator', () => {
      startTracking()
      const socket = createOpenConnection()

      callClose(socket, { at: 30 })

      const closing = single(closingPayloads())
      expect(closing.id).toBe(single(connectingPayloads()).id)
      expect(closing.closing_date).toBe(clock.timeStamp(30))
      expect(closing.close_initiator).toBe('client')
    })

    it('is reported between the open and the closed vital', () => {
      startTracking()
      const socket = createOpenConnection()

      callClose(socket)
      dispatchClose(socket)

      expect(emittedVitals().map((event) => event.rawRumEvent.vital.name)).toEqual([
        WebSocketVitalName.CONNECTING,
        WebSocketVitalName.OPEN,
        WebSocketVitalName.CLOSING,
        WebSocketVitalName.CLOSED,
      ])
    })

    it('takes no snapshot version from the sequence the snapshot-carrying vitals share', () => {
      startTracking()
      const socket = createOpenConnection()

      callClose(socket)
      dispatchClose(socket)

      expect(single(openPayloads()).snapshot_version).toBe(1)
      expect(single(closedPayloads()).snapshot_version).toBe(2)
    })

    it('is emitted for a close() during the handshake, whose failure then reports an unclean close', () => {
      startTracking()
      const socket = createConnectingConnection()

      callClose(socket, { at: 5 })
      // the browser fails a connection aborted mid-handshake
      failHandshake(socket, { at: 6 })

      expect(single(closingPayloads()).closing_date).toBe(clock.timeStamp(5))
      expect(single(closedPayloads()).was_clean).toBe(false)
      expect(openPayloads()).toHaveSize(0)
    })
  })

  describe('the closed vital', () => {
    it('reports the url stripped of its query string when the connection closes', () => {
      startTracking()
      const socket = createOpenConnection({ url: 'wss://example.com/chat?token=secret' })

      dispatchClose(socket)

      expect(single(closedPayloads()).url).toBe('wss://example.com/chat')
    })

    it('reports the url stripped of its query string when tracking ends on a flush', () => {
      const tracker = startTracking()
      createOpenConnection({ url: 'wss://example.com/chat?token=secret' })

      tracker.flushOpenConnections()

      expect(single(closedPayloads()).url).toBe('wss://example.com/chat')
    })

    it('reports the close outcome of a real close event, and the event as the reason', () => {
      startTracking()
      const socket = createOpenConnection()

      dispatchClose(socket, { at: 40, code: 1001, reason: 'going away', wasClean: false })

      expect(single(closedPayloads())).toEqual(
        jasmine.objectContaining({
          tracking_end_reason: WebSocketTrackingEndReason.CLOSE_EVENT,
          close_code: 1001,
          close_reason: 'going away',
          was_clean: false,
          closed_date: clock.timeStamp(40),
        })
      )
    })

    it('reports the send queue depth the close event carried', () => {
      startTracking()
      const socket = createOpenConnection()
      socket.bufferedAmount = 128

      dispatchClose(socket)

      expect(single(closedPayloads()).snapshot!.outbound.buffered_amount_at_close).toBe(128)
    })

    it('reports a flush with no close event as the session ending, dated at the flush', () => {
      const tracker = startTracking()
      createOpenConnection()
      advanceTo(40)

      tracker.flushOpenConnections()

      expect(single(closedPayloads())).toEqual(
        jasmine.objectContaining({
          tracking_end_reason: WebSocketTrackingEndReason.SESSION_END,
          closed_date: clock.timeStamp(40),
        })
      )
    })

    it('reports the send queue depth read from the socket when no close event was received', () => {
      const tracker = startTracking()
      const socket = createOpenConnection()
      socket.bufferedAmount = 512

      tracker.flushOpenConnections()

      expect(single(closedPayloads()).snapshot!.outbound.buffered_amount_at_close).toBe(512)
    })

    it('starts the snapshot sequence at 1 for a connection that never opened', () => {
      startTracking()
      const socket = createConnectingConnection()

      failHandshake(socket)

      expect(single(closedPayloads()).snapshot_version).toBe(1)
    })

    it('continues the snapshot sequence the open vitals started, so it holds the highest version', () => {
      startTracking()
      const socket = createOpenConnection()
      tickPeriodicReport(2)

      dispatchClose(socket)

      expect(openPayloads().map((payload) => payload.snapshot_version)).toEqual([1, 2, 3])
      expect(single(closedPayloads()).snapshot_version).toBe(4)
    })

    it('reports the terminal snapshot of the connection, timed from the open date', () => {
      startTracking()
      const socket = createOpenConnection({ at: 10 })
      receiveMessage(socket, 30, { at: 20 })
      sendMessage(socket, 10, { at: 25, bufferedAmountPreSend: 100 })

      dispatchClose(socket, { at: 40 })

      const { snapshot } = single(closedPayloads())
      expect(snapshot!.inbound).toEqual(
        jasmine.objectContaining({
          message_count: 1,
          message_size_total: 30,
          time_to_first_message: toServerDuration(10 as Duration),
          silence_before_close: toServerDuration(20 as Duration),
        })
      )
      expect(snapshot!.outbound).toEqual(
        jasmine.objectContaining({
          message_count: 1,
          message_size_total: 10,
          time_to_first_message: toServerDuration(15 as Duration),
          buffered_amount_max: 110,
        })
      )
    })

    it('counts no outbound message the socket discarded after the closing handshake started', () => {
      startTracking()
      const socket = createOpenConnection()
      sendMessage(socket, 10)
      callClose(socket)

      sendMessage(socket, 500)
      dispatchClose(socket)

      expect(single(closedPayloads()).snapshot!.outbound).toEqual(
        jasmine.objectContaining({ message_count: 1, message_size_total: 10, message_size_max: 10 })
      )
    })
  })

  // The live instance lets a consumer read the socket's own state (bufferedAmount, readyState) or
  // interact with it (close it, inspect its listeners) from a beforeSend/observer callback.
  describe('the domain context', () => {
    it('exposes the same socket instance on every vital of the connection lifecycle', () => {
      startTracking()
      const socket = createConnectingConnection()
      expect(webSocketOf(single(emittedVitals(WebSocketVitalName.CONNECTING)))).toBe(socket)

      completeHandshake(socket)
      expect(webSocketOf(single(emittedVitals(WebSocketVitalName.OPEN)))).toBe(socket)

      tickPeriodicReport()
      const openVitals = emittedVitals(WebSocketVitalName.OPEN)
      expect(openVitals).toHaveSize(2)
      expect(webSocketOf(openVitals[1])).toBe(socket)

      callClose(socket)
      expect(webSocketOf(single(emittedVitals(WebSocketVitalName.CLOSING)))).toBe(socket)

      dispatchClose(socket)
      expect(webSocketOf(single(emittedVitals(WebSocketVitalName.CLOSED)))).toBe(socket)
    })
  })

  describe('the dates of the later phases', () => {
    // they are placed on the monotonic clock, which has sub-millisecond precision, while the schema
    // wants whole milliseconds
    it('are reported in whole milliseconds', () => {
      startTracking()
      const socket = createConnectingConnection({ at: 0 })
      completeHandshake(socket, { at: 10.4 })
      callClose(socket, { at: 20.6 })
      dispatchClose(socket, { at: 30.5 })

      expect(single(openPayloads()).open_date).toBe(clock.timeStamp(10))
      expect(single(closingPayloads()).closing_date).toBe(clock.timeStamp(21))
      expect(single(closedPayloads()).closed_date).toBe(clock.timeStamp(31))
    })
  })

  // A connection is measured on the monotonic clock, and the dates of its later phases are placed
  // from its connecting date, so a system clock stepping back or forth mid-connection (an NTP step,
  // a VM resume, a manual correction) corrupts neither its chronology nor its intervals.
  describe('under a system clock change', () => {
    it('measures the connection on its own timeline, while each vital stays dated by the system clock', () => {
      startTracking()
      const socket = createConnectingConnection({ at: 0 })
      advanceTo(5)
      clock.jumpSystemClock(-10 * ONE_MINUTE)
      completeHandshake(socket, { at: 10 })
      advanceTo(15)
      clock.jumpSystemClock(ONE_HOUR)
      receiveMessage(socket, 30, { at: 20 })
      callClose(socket, { at: 30 })
      dispatchClose(socket, { at: 40 })

      const open = single(openPayloads())
      const closed = single(closedPayloads())
      expect(single(connectingPayloads()).connecting_date).toBe(clock.timeStamp(0))
      expect(open.open_date).toBe(clock.timeStamp(10))
      expect(single(closingPayloads()).closing_date).toBe(clock.timeStamp(30))
      expect(closed.closed_date).toBe(clock.timeStamp(40))
      expect(open.connecting_duration).toBe(toServerDuration(10 as Duration))
      expect(closed.duration).toBe(toServerDuration(40 as Duration))
      expect(closed.snapshot!.inbound).toEqual(
        jasmine.objectContaining({
          time_to_first_message: toServerDuration(10 as Duration),
          silence_before_close: toServerDuration(20 as Duration),
        })
      )

      expect(emittedVitals().map((event) => event.rawRumEvent.date)).toEqual([
        clock.timeStamp(0),
        clock.timeStamp(10 - 10 * ONE_MINUTE),
        clock.timeStamp(30 - 10 * ONE_MINUTE + ONE_HOUR),
        clock.timeStamp(40 - 10 * ONE_MINUTE + ONE_HOUR),
      ])
    })
  })

  describe('tracking end', () => {
    it('reports a connection a flush finalized only once, even when its close event arrives later', () => {
      const tracker = startTracking()
      const socket = createOpenConnection()

      tracker.flushOpenConnections()
      dispatchClose(socket)

      expect(closedPayloads()).toHaveSize(1)
    })

    it('reports nothing more once stopped', () => {
      const tracker = startTracking()
      const socket = createConnectingConnection()

      tracker.stop()
      dispatchClose(socket)

      expect(closedPayloads()).toHaveSize(0)
    })
  })

  describe('startWebSocketCollection', () => {
    function startCollection(configuration = mockRumConfiguration({ betaTrackWebSockets: true })) {
      const collection = startWebSocketCollection(lifeCycle, configuration, noopEarlyWebSocketCollection)
      registerCleanupTask(() => collection.stop())
      return collection
    }

    describe('opt-in gate', () => {
      ;(
        [
          { trackResources: true, betaTrackWebSockets: true, experimentalFeature: false, collects: true },
          { trackResources: true, betaTrackWebSockets: false, experimentalFeature: true, collects: true },
          { trackResources: true, betaTrackWebSockets: false, experimentalFeature: false, collects: false },
          { trackResources: false, betaTrackWebSockets: true, experimentalFeature: false, collects: false },
          { trackResources: false, betaTrackWebSockets: false, experimentalFeature: true, collects: false },
        ] as const
      ).forEach(({ trackResources, betaTrackWebSockets, experimentalFeature, collects }) => {
        it(`${collects ? 'collects' : 'does not collect'} with trackResources=${trackResources}, betaTrackWebSockets=${betaTrackWebSockets}, TRACK_WEBSOCKETS=${experimentalFeature}`, () => {
          if (experimentalFeature) {
            addExperimentalFeatures([ExperimentalFeature.TRACK_WEBSOCKETS])
          }

          startCollection(mockRumConfiguration({ trackResources, betaTrackWebSockets }))
          dispatchClose(createOpenConnection())

          expect(emittedVitals()).toHaveSize(collects ? 3 : 0)
        })
      })
    })

    // Unlike view tracking, which filters to the unloading reason: a view survives a background
    // transition, a connection may not, and hidden is the only signal mobile browsers guarantee at
    // that point.
    describe('the background-transition report', () => {
      ;[PageExitReason.HIDDEN, PageExitReason.FROZEN, PageExitReason.UNLOADING].forEach((reason) => {
        it(`emits a report for every open connection on a "${reason}" transition`, () => {
          startCollection()
          createOpenConnection()
          createOpenConnection()

          lifeCycle.notify(LifeCycleEventType.PREPARE_URGENT_FLUSH, reason)

          const [idA, idB] = connectingPayloads().map((payload) => payload.id)
          expect(openPayloads().map((payload) => payload.id)).toEqual([idA, idB, idA, idB])
          expect(openPayloads().map((payload) => payload.snapshot_version)).toEqual([1, 1, 2, 2])
        })
      })

      it('does not emit a report for a connection that is not open', () => {
        startCollection()
        createConnectingConnection()

        lifeCycle.notify(LifeCycleEventType.PREPARE_URGENT_FLUSH, PageExitReason.HIDDEN)

        expect(openPayloads()).toHaveSize(0)
      })

      it('stops emitting reports after stop()', () => {
        const collection = startCollection()
        createOpenConnection()

        collection.stop()
        lifeCycle.notify(LifeCycleEventType.PREPARE_URGENT_FLUSH, PageExitReason.HIDDEN)

        expect(openPayloads()).toHaveSize(1)
      })
    })

    describe('the page termination', () => {
      it('ends tracking of an open connection when the page is terminated', () => {
        startCollection()
        createOpenConnection()
        advanceTo(40)

        lifeCycle.notify(LifeCycleEventType.PREPARE_URGENT_FLUSH, PageExitReason.PAGE_TERMINATED)

        expect(single(closedPayloads())).toEqual(
          jasmine.objectContaining({
            tracking_end_reason: WebSocketTrackingEndReason.PAGE_TERMINATED,
            closed_date: clock.timeStamp(40),
          })
        )
      })

      it('ends tracking of every connection, whatever its phase', () => {
        startCollection()
        createConnectingConnection()
        createOpenConnection()
        callClose(createOpenConnection())

        lifeCycle.notify(LifeCycleEventType.PREPARE_URGENT_FLUSH, PageExitReason.PAGE_TERMINATED)

        expect(closedPayloads().map((payload) => payload.tracking_end_reason)).toEqual([
          WebSocketTrackingEndReason.PAGE_TERMINATED,
          WebSocketTrackingEndReason.PAGE_TERMINATED,
          WebSocketTrackingEndReason.PAGE_TERMINATED,
        ])
      })

      it('reports no close outcome, the next snapshot version and the send queue depth read from the socket', () => {
        startCollection()
        const socket = createOpenConnection()
        socket.bufferedAmount = 12

        lifeCycle.notify(LifeCycleEventType.PREPARE_URGENT_FLUSH, PageExitReason.PAGE_TERMINATED)

        const payload = single(closedPayloads())
        expect(payload).toEqual(jasmine.objectContaining({ snapshot_version: 2 }))
        expect(payload.snapshot?.outbound.buffered_amount_at_close).toBe(12)
        expect(payload.close_code).toBeUndefined()
        expect(payload.close_reason).toBeUndefined()
        expect(payload.was_clean).toBeUndefined()
      })

      it('reports nothing more for a connection whose close event arrives after the page terminated', () => {
        startCollection()
        const socket = createOpenConnection()

        lifeCycle.notify(LifeCycleEventType.PREPARE_URGENT_FLUSH, PageExitReason.PAGE_TERMINATED)
        dispatchClose(socket)

        expect(single(closedPayloads()).tracking_end_reason).toBe(WebSocketTrackingEndReason.PAGE_TERMINATED)
      })

      it('reports nothing more for a connection that closed before the page terminated', () => {
        startCollection()
        dispatchClose(createOpenConnection())

        lifeCycle.notify(LifeCycleEventType.PREPARE_URGENT_FLUSH, PageExitReason.PAGE_TERMINATED)

        expect(single(closedPayloads()).tracking_end_reason).toBe(WebSocketTrackingEndReason.CLOSE_EVENT)
      })

      it('replaces open reports with a single closed vital when the page is terminated', () => {
        startCollection()
        createOpenConnection()

        lifeCycle.notify(LifeCycleEventType.PREPARE_URGENT_FLUSH, PageExitReason.PAGE_TERMINATED)
        tickPeriodicReport()

        expect(openPayloads()).toHaveSize(1)
        expect(closedPayloads()).toHaveSize(1)
      })
    })

    it('finalizes open connections when the session expires', () => {
      startCollection()
      createConnectingConnection()
      advanceTo(40)

      expireSession()

      expect(single(closedPayloads())).toEqual(
        jasmine.objectContaining({
          tracking_end_reason: WebSocketTrackingEndReason.SESSION_END,
          closed_date: clock.timeStamp(40),
        })
      )
    })

    it('ignores further WebSocket events from the same instance after the session expires', () => {
      startCollection()
      const socket = createOpenConnection()
      sendMessage(socket, 10)

      expireSession()

      expect(closedPayloads()).toHaveSize(1)

      sendMessage(socket, 7)
      dispatchClose(socket)

      expect(closedPayloads()).toHaveSize(1)
    })

    it('finalizes open connections on stop(), then ignores their events', () => {
      const collection = startCollection()
      const socket = createOpenConnection()
      advanceTo(40)

      collection.stop()
      dispatchClose(socket)

      expect(single(closedPayloads())).toEqual(
        jasmine.objectContaining({
          tracking_end_reason: WebSocketTrackingEndReason.SESSION_END,
          closed_date: clock.timeStamp(40),
        })
      )
    })
  })

  describe('early collection', () => {
    function startCollection(
      earlyCollection: EarlyWebSocketCollection,
      configuration = mockRumConfiguration({ betaTrackWebSockets: true })
    ) {
      const collection = startWebSocketCollection(lifeCycle, configuration, earlyCollection)
      registerCleanupTask(() => collection.stop())
      return collection
    }

    // The phases buffered before the collection started are replayed in a microtask, which a browser
    // runs before it dispatches any other event: specs wait for it before driving the sockets on.

    it('emits nothing before the collection started', async () => {
      startEarlyCollection()

      dispatchClose(createOpenConnection())
      await waitNextMicrotask()

      expect(emittedVitals()).toHaveSize(0)
    })

    it('reports the whole lifecycle of a connection that ended before the collection started, once it starts', async () => {
      const earlyCollection = startEarlyCollection()
      const socket = createOpenConnection()
      callClose(socket)
      dispatchClose(socket)

      startCollection(earlyCollection)
      await waitNextMicrotask()

      expect(emittedVitals().map((event) => event.rawRumEvent.vital.name)).toEqual([
        WebSocketVitalName.CONNECTING,
        WebSocketVitalName.OPEN,
        WebSocketVitalName.CLOSING,
        WebSocketVitalName.CLOSED,
      ])
      expect(webSocketOf(emittedVitals()[0])).toBe(socket)
    })

    it('keeps tracking a connection created before the collection started under the same connection id', async () => {
      const earlyCollection = startEarlyCollection()
      const socket = createConnectingConnection()

      startCollection(earlyCollection)
      await waitNextMicrotask()
      completeHandshake(socket, { at: 10 })
      dispatchClose(socket, { at: 20 })

      const connectionId = single(connectingPayloads()).id
      expect(emittedVitals().map((event) => event.rawRumEvent.vital.name)).toEqual([
        WebSocketVitalName.CONNECTING,
        WebSocketVitalName.OPEN,
        WebSocketVitalName.CLOSED,
      ])
      expect(emittedVitals().map((event) => event.rawRumEvent.vital.websocket.id)).toEqual([
        connectionId,
        connectionId,
        connectionId,
      ])
    })

    it('counts the messages exchanged in the terminal snapshot before the collection started', async () => {
      const earlyCollection = startEarlyCollection()
      const socket = createOpenConnection()
      receiveMessage(socket, 30)
      sendMessage(socket, 10)

      startCollection(earlyCollection)
      await waitNextMicrotask()
      dispatchClose(socket)

      const { snapshot } = single(closedPayloads())
      expect(snapshot!.inbound).toEqual(jasmine.objectContaining({ message_count: 1, message_size_total: 30 }))
      expect(snapshot!.outbound).toEqual(jasmine.objectContaining({ message_count: 1, message_size_total: 10 }))
    })

    it('reports a connection opened before the collection started as soon as it starts', () => {
      const earlyCollection = startEarlyCollection()
      const socket = createOpenConnection()
      receiveMessage(socket, 30)

      startCollection(earlyCollection)

      const report = single(openPayloads())
      expect(report.snapshot_version).toBe(2)
      expect(report.snapshot.inbound).toEqual(jasmine.objectContaining({ message_count: 1, message_size_total: 30 }))
    })

    it('replays the buffered phases after the open report made at start', async () => {
      const earlyCollection = startEarlyCollection()
      createOpenConnection()
      advanceTo(10)

      startCollection(earlyCollection)
      await waitNextMicrotask()

      // emitted out of phase order, each vital is still dated at the phase it reports and carries the
      // snapshot version it was reported with
      expect(emittedVitals().map((event) => event.rawRumEvent.vital.name)).toEqual([
        WebSocketVitalName.OPEN,
        WebSocketVitalName.CONNECTING,
        WebSocketVitalName.OPEN,
      ])
      expect(emittedVitals().map((event) => event.startClocks.timeStamp)).toEqual([
        clock.timeStamp(10),
        clock.timeStamp(0),
        clock.timeStamp(0),
      ])
      // The first payload is the one reported as the collection starts.
      // The second payload is the one buffered before the collection started,
      // we need to keep it for connections that close before the collection started.
      expect(openPayloads().map((payload) => payload.snapshot_version)).toEqual([2, 1])
    })

    it('reports a phase entered in the same task as the start before the replayed ones', async () => {
      const earlyCollection = startEarlyCollection()
      const socket = createOpenConnection()

      startCollection(earlyCollection)
      callClose(socket, { at: 10 })
      await waitNextMicrotask()

      expect(vitalsOf(socket).map((event) => event.rawRumEvent.vital.name)).toEqual([
        WebSocketVitalName.OPEN,
        WebSocketVitalName.CLOSING,
        WebSocketVitalName.CONNECTING,
        WebSocketVitalName.OPEN,
      ])
    })

    it('reports a connection opened before the collection started periodically once it starts', async () => {
      const earlyCollection = startEarlyCollection()
      createOpenConnection()

      startCollection(earlyCollection)
      await waitNextMicrotask()
      tickPeriodicReport()

      expect(openPayloads().map((payload) => payload.snapshot_version)).toEqual([2, 1, 3])
    })

    it('buffers one open phase for a connection still open when the collection starts', async () => {
      const earlyCollection = startEarlyCollection()
      createOpenConnection()
      // the periodic report, which would buffer more open phases, only runs once the collection started
      tickPeriodicReport(3)

      startCollection(earlyCollection)
      await waitNextMicrotask()

      // the open report the collection makes as it starts, then the one open phase replayed
      expect(openPayloads().map((payload) => payload.snapshot_version)).toEqual([2, 1])
    })

    describe('buffer capacity', () => {
      it('replays every phase of a full buffer without drop telemetry', async () => {
        const telemetry = startMockTelemetry()
        const earlyCollection = startEarlyCollection()
        for (let i = 0; i < EARLY_PHASES_BUFFER_CAPACITY / 4; i++) {
          const socket = createOpenConnection()
          callClose(socket)
          dispatchClose(socket)
        }

        startCollection(earlyCollection)
        await waitNextMicrotask()

        expect(emittedVitals()).toHaveSize(EARLY_PHASES_BUFFER_CAPACITY)
        expect(await telemetry.hasEvents()).toBe(false)
      })

      it('does not replay the phases of a connection whose connecting phase was dropped', async () => {
        const earlyCollection = startEarlyCollection()
        const [oldestSocket] = fillBufferWithOpenConnections()
        dispatchClose(oldestSocket)

        startCollection(earlyCollection)
        await waitNextMicrotask()

        expect(vitalsOf(oldestSocket)).toEqual([])
      })

      it('never reports a connection whose connecting phase was dropped, even once it closes', async () => {
        const earlyCollection = startEarlyCollection()
        const [oldestSocket] = fillBufferWithOpenConnections()
        createConnectingConnection()

        startCollection(earlyCollection)
        expect(vitalsOf(oldestSocket)).toEqual([])

        await waitNextMicrotask()
        dispatchClose(oldestSocket)

        expect(vitalsOf(oldestSocket)).toEqual([])
      })

      it('evicts the oldest phases first', async () => {
        const earlyCollection = startEarlyCollection()
        const sockets: MockWebSocket[] = []
        for (let i = 0; i < EARLY_PHASES_BUFFER_CAPACITY + 1; i++) {
          sockets.push(createConnectingConnection())
        }

        startCollection(earlyCollection)
        await waitNextMicrotask()

        expect(emittedVitals().map(webSocketOf)).toEqual(sockets.slice(1))
      })

      it('reports the number of dropped phases with debug telemetry after the hand-off', async () => {
        const telemetry = startMockTelemetry()
        const earlyCollection = startEarlyCollection()
        fillBufferWithOpenConnections()
        createOpenConnection()

        expect(await telemetry.hasEvents()).toBe(false)

        startCollection(earlyCollection)
        await waitNextMicrotask()

        expect(await telemetry.getEvents()).toEqual([
          jasmine.objectContaining({
            status: 'debug',
            message: 'Dropped early WebSocket phases, buffer is full',
            count: 2,
            capacity: EARLY_PHASES_BUFFER_CAPACITY,
          }),
        ])
      })

      it('skips the drop telemetry when the early collection stops', async () => {
        const telemetry = startMockTelemetry()
        const earlyCollection = startEarlyCollection()
        fillBufferWithOpenConnections()
        createOpenConnection()

        earlyCollection.stop()

        expect(await telemetry.hasEvents()).toBe(false)
      })

      /** Fills the buffer with open connections, two phases each: connecting and open. Oldest first. */
      function fillBufferWithOpenConnections() {
        const sockets: MockWebSocket[] = []
        for (let i = 0; i < EARLY_PHASES_BUFFER_CAPACITY / 2; i++) {
          sockets.push(createOpenConnection())
        }
        return sockets
      }
    })

    it('reports nothing of a connection created before the collection started when tracking is not enabled', async () => {
      const earlyCollection = startEarlyCollection()
      const socket = createOpenConnection()

      startCollection(earlyCollection, mockRumConfiguration({ betaTrackWebSockets: false }))
      await waitNextMicrotask()
      dispatchClose(socket)

      expect(emittedVitals()).toHaveSize(0)
    })

    it('forgets the connections created before the collection started when tracking is not enabled', () => {
      const earlyCollection = startEarlyCollection()
      createOpenConnection()

      startCollection(earlyCollection, mockRumConfiguration({ betaTrackWebSockets: false }))

      expect(startTracking().flushOpenConnections()).toBe(0)
    })

    it('releases the buffered phases when tracking is not enabled', async () => {
      const earlyCollection = startEarlyCollection()
      createOpenConnection()
      const observer = jasmine.createSpy('observer')

      startCollection(earlyCollection, mockRumConfiguration({ betaTrackWebSockets: false }))
      earlyCollection.phases.subscribe(observer)
      await waitNextMicrotask()

      expect(observer).not.toHaveBeenCalled()
    })

    it('restores the native constructor when tracking is not enabled', () => {
      const nativeWebSocket = window.WebSocket
      const earlyCollection = startEarlyCollection()

      startCollection(earlyCollection, mockRumConfiguration({ betaTrackWebSockets: false }))

      expect(window.WebSocket).toBe(nativeWebSocket)
    })

    ;(['stop', 'handOff'] as const).forEach((method) => {
      describe(`${method}()`, () => {
        it('unsubscribes from the WebSocket observable only once when called twice', () => {
          const unsubscribeSpy = spyOnWebSocketObservableUnsubscribe()
          const earlyCollection = startEarlyCollection()

          earlyCollection[method]()
          earlyCollection[method]()

          expect(unsubscribeSpy).toHaveBeenCalledTimes(1)
        })

        it('replays the buffered phases to the observers already subscribed, then releases them', async () => {
          const earlyCollection = startEarlyCollection()
          createOpenConnection()
          const subscribedBefore = jasmine.createSpy('subscribedBefore')
          const subscribedAfter = jasmine.createSpy('subscribedAfter')
          earlyCollection.phases.subscribe(subscribedBefore)

          earlyCollection[method]()
          earlyCollection.phases.subscribe(subscribedAfter)
          await waitNextMicrotask()

          expect(subscribedBefore).toHaveBeenCalledTimes(2)
          expect(subscribedAfter).not.toHaveBeenCalled()
        })
      })
    })

    describe('stop()', () => {
      it('restores the native constructor and does not throw when called twice', () => {
        const nativeWebSocket = window.WebSocket
        const earlyCollection = startEarlyCollection()

        earlyCollection.stop()

        expect(() => earlyCollection.stop()).not.toThrow()
        expect(window.WebSocket).toBe(nativeWebSocket)
      })

      it('forgets the connections observed so far', () => {
        const earlyCollection = startEarlyCollection()
        createOpenConnection()

        earlyCollection.stop()

        expect(startTracking().flushOpenConnections()).toBe(0)
      })
    })

    describe('handOff()', () => {
      it('keeps the connections observed so far', () => {
        const earlyCollection = startEarlyCollection()
        createOpenConnection()

        earlyCollection.handOff()

        expect(startTracking().flushOpenConnections()).toBe(1)
      })
    })

    function spyOnWebSocketObservableUnsubscribe() {
      const observable = initWebSocketObservable()
      const subscribe = observable.subscribe.bind(observable)
      const unsubscribeSpy = jasmine.createSpy('unsubscribe')
      spyOn(observable, 'subscribe').and.callFake((observer) => {
        const subscription = subscribe(observer)
        return {
          unsubscribe: () => {
            unsubscribeSpy()
            subscription.unsubscribe()
          },
        }
      })
      return unsubscribeSpy
    }

    it('stops buffering once the collection started', () => {
      const earlyCollection = startEarlyCollection()
      startCollection(earlyCollection)

      const socket = createOpenConnection()
      receiveMessage(socket, 30)
      tickPeriodicReport()
      dispatchClose(socket)

      // a still subscribed early collection records every message a second time, and ends the
      // connection before the collection gets to report its close
      expect(openPayloads()[1].snapshot.inbound).toEqual(
        jasmine.objectContaining({ message_count: 1, message_size_total: 30 })
      )
      expect(emittedVitals().map((event) => event.rawRumEvent.vital.name)).toEqual([
        WebSocketVitalName.CONNECTING,
        WebSocketVitalName.OPEN,
        WebSocketVitalName.OPEN,
        WebSocketVitalName.CLOSED,
      ])
    })

    it('keeps tracking the connections created through a constructor kept from before the collection started', () => {
      const earlyCollection = startEarlyCollection()
      // like a library that reads the global when its module is evaluated
      const KeptWebSocket = window.WebSocket as unknown as typeof MockWebSocket

      startCollection(earlyCollection)
      const socket = new KeptWebSocket('wss://example.com/socket')

      expect(webSocketOf(single(emittedVitals()))).toBe(socket)
    })

    it('reports closing buffered before start and closed after start under the same connection id', async () => {
      const earlyCollection = startEarlyCollection()
      const socket = createOpenConnection()
      callClose(socket, { at: 10 })

      startCollection(earlyCollection)
      await waitNextMicrotask()
      dispatchClose(socket, { at: 20 })

      const connectionId = single(connectingPayloads()).id
      expect(emittedVitals().map((event) => event.rawRumEvent.vital.name)).toEqual([
        WebSocketVitalName.CONNECTING,
        WebSocketVitalName.OPEN,
        WebSocketVitalName.CLOSING,
        WebSocketVitalName.CLOSED,
      ])
      expect(emittedVitals().map((event) => event.rawRumEvent.vital.websocket.id)).toEqual([
        connectionId,
        connectionId,
        connectionId,
        connectionId,
      ])
      expect(single(closingPayloads()).closing_date).toBe(clock.timeStamp(10))
      expect(single(closedPayloads()).closed_date).toBe(clock.timeStamp(20))
    })

    function startEarlyCollection() {
      const earlyCollection = startEarlyWebSocketCollection()
      registerCleanupTask(() => {
        earlyCollection.stop()
        resetTrackedConnections()
      })
      return earlyCollection
    }
  })

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  function startTracking() {
    const tracker = trackWebSocket(initWebSocketObservable(), (instance, connection) => {
      emitWebSocketVital(lifeCycle, instance, connection.getState())
    })
    registerCleanupTask(tracker.stop)
    return tracker
  }

  function expireSession(endClocks = clocksNow()) {
    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, { endClocks })
  }

  // ---------------------------------------------------------------------------
  // Driving time
  //
  // Dates are given in milliseconds since the spec started, on the monotonic clock so that a jump of
  // the system clock does not move them, and only ever move forward: time is ticked rather than set,
  // so that the periodic report timer fires on the way like it would in a browser.
  // ---------------------------------------------------------------------------

  /** Moves time forward to `at`, or leaves it where it is when no date is given. */
  function advanceTo(at: number | undefined) {
    if (at === undefined) {
      return
    }
    const now = performance.now() - clock.relative(0)
    if (at < now) {
      throw new Error(`Cannot move time back from ${now} to ${at}`)
    }
    clock.tick(at - now)
  }

  function tickPeriodicReport(count = 1) {
    clock.tick(count * WEBSOCKET_PERIODIC_REPORT_INTERVAL)
  }

  // ---------------------------------------------------------------------------
  // Driving a socket
  //
  // Each helper plays either the application calling the socket API or the browser dispatching an
  // event on it, at the date it is given.
  // ---------------------------------------------------------------------------

  interface At {
    at?: number
  }

  function createConnectingConnection({
    at,
    url = 'wss://example.com/socket',
    protocols,
  }: At & { url?: string; protocols?: string | string[] } = {}) {
    advanceTo(at)
    return createMockWebSocket(url, protocols)
  }

  function completeHandshake(
    socket: MockWebSocket,
    { at, protocol = '', extensions = '' }: At & { protocol?: string; extensions?: string } = {}
  ) {
    advanceTo(at)
    socket.protocol = protocol
    socket.extensions = extensions
    socket.simulateOpen()
  }

  /** A socket constructed and opened at the same date, for specs that do not care about the handshake. */
  function createOpenConnection({ at, url }: At & { url?: string } = {}) {
    const socket = createConnectingConnection({ at, url })
    completeHandshake(socket)
    return socket
  }

  function receiveMessage(socket: MockWebSocket, size: number, { at }: At = {}) {
    advanceTo(at)
    socket.simulateIncomingMessage('x'.repeat(size))
  }

  function sendMessage(
    socket: MockWebSocket,
    size: number,
    { at, bufferedAmountPreSend = 0 }: At & { bufferedAmountPreSend?: number } = {}
  ) {
    advanceTo(at)
    socket.bufferedAmount = bufferedAmountPreSend
    socket.send('x'.repeat(size))
  }

  /** The application calling `close()`, which is the only way the CLOSING phase is observed. */
  function callClose(socket: MockWebSocket, { at }: At = {}) {
    advanceTo(at)
    socket.close()
  }

  function dispatchClose(
    socket: MockWebSocket,
    {
      at,
      code = 1000,
      reason = 'bye',
      wasClean = true,
    }: At & { code?: number; reason?: string; wasClean?: boolean } = {}
  ) {
    advanceTo(at)
    socket.simulateClose(code, reason, wasClean)
  }

  /** The browser failing the connection, whether the handshake never completed or was aborted. */
  function failHandshake(socket: MockWebSocket, { at }: At = {}) {
    dispatchClose(socket, { at, code: 1006, reason: '', wasClean: false })
  }

  // ---------------------------------------------------------------------------
  // Reading emitted vitals
  // ---------------------------------------------------------------------------

  function emittedVitals(name?: WebSocketVitalName) {
    return name === undefined
      ? collectedEvents
      : collectedEvents.filter((event) => event.rawRumEvent.vital.name === name)
  }

  /** The one item of a list the spec expects to hold exactly one. */
  function single<T>(items: T[]): T {
    expect(items).toHaveSize(1)
    return items[0]
  }

  // ---------------------------------------------------------------------------
  // Reading phase payloads
  //
  // The payload of a phase is picked by the name the collection module chose; the serializer's own
  // spec is where the compiler checks that a name and its payload agree.
  // ---------------------------------------------------------------------------

  function connectingPayloads() {
    return emittedVitals(WebSocketVitalName.CONNECTING).map(
      (event) => event.rawRumEvent.vital.websocket as { id: string } & RawRumWebSocketConnectingVitalProperties
    )
  }

  function openPayloads() {
    return emittedVitals(WebSocketVitalName.OPEN).map(
      (event) => event.rawRumEvent.vital.websocket as { id: string } & RawRumWebSocketOpenVitalProperties
    )
  }

  function closingPayloads() {
    return emittedVitals(WebSocketVitalName.CLOSING).map(
      (event) => event.rawRumEvent.vital.websocket as { id: string } & RawRumWebSocketClosingVitalProperties
    )
  }

  function closedPayloads() {
    return emittedVitals(WebSocketVitalName.CLOSED).map(
      (event) => event.rawRumEvent.vital.websocket as { id: string } & RawRumWebSocketClosedVitalProperties
    )
  }

  /** The live socket instance a vital's domain context carries. */
  function webSocketOf(event: RawRumEventCollectedData<RawRumWebSocketVitalEvent>) {
    return (event.domainContext as RumWebSocketVitalEventDomainContext).webSocket as unknown as MockWebSocket
  }

  /** The vitals one socket reported, in the order they were emitted. */
  function vitalsOf(socket: MockWebSocket) {
    return emittedVitals().filter((event) => webSocketOf(event) === socket)
  }
})

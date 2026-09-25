import {
  addExperimentalFeatures,
  DOM_EVENT,
  ExperimentalFeature,
  initWebSocketObservable,
  noop,
  Observable,
  PageExitReason,
  resetAllowUntrustedEvents,
  setAllowUntrustedEvents,
} from '@datadog/browser-core'
import {
  createMockWebSocket,
  createNewEvent,
  mockClock,
  mockWebSocket,
  registerCleanupTask,
  type Clock,
  type MockWebSocket,
} from '@datadog/browser-core/test'
import type { Duration } from '@datadog/js-core/time'
import { clocksNow, toServerDuration } from '@datadog/js-core/time'
import { globalObject } from '@datadog/js-core/util'
import { mockRumConfiguration } from '../../../test'
import type {
  RawRumWebSocketClosedVitalProperties,
  RawRumWebSocketClosingVitalProperties,
  RawRumWebSocketConnectingVitalProperties,
  RawRumWebSocketOpenVitalProperties,
} from '../../rawRumEvent.types'
import { WebSocketTrackingEndReason, WebSocketVitalName } from '../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { WEBSOCKET_BACKPRESSURE_THRESHOLD_BYTES } from './trackedConnection'
import type { AddWebSocketVital } from './webSocketCollection'
import { startWebSocketCollection, trackWebSocket, WEBSOCKET_HEARTBEAT_INTERVAL } from './webSocketCollection'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('webSocketCollection', () => {
  let lifeCycle: LifeCycle
  let addWebSocketVitalSpy: jasmine.Spy<AddWebSocketVital>
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    mockWebSocket()
    // the mock socket dispatches untrusted events, which the SDK listeners would otherwise ignore
    setAllowUntrustedEvents(true)
    lifeCycle = new LifeCycle()
    addWebSocketVitalSpy = jasmine.createSpy()
    registerCleanupTask(resetAllowUntrustedEvents)
  })

  describe('connection identity', () => {
    it('reports every vital of a connection under one connection id, and each under a fresh vital id', () => {
      startTracking()
      const socket = connect()
      completeHandshake(socket, { at: 10 })
      dispatchClose(socket, { at: 20 })

      const vitals = emittedVitals()
      const connectionId = single(connectingPayloads()).id
      expect(vitals.map((vital) => vital.vital.name)).toEqual([
        WebSocketVitalName.CONNECTING,
        WebSocketVitalName.OPEN,
        WebSocketVitalName.CLOSED,
      ])
      expect(connectionId).toMatch(UUID_PATTERN)
      expect(vitals.map((vital) => vital.vital.websocket.id)).toEqual([connectionId, connectionId, connectionId])

      const vitalIds = vitals.map((vital) => vital.vital.id)
      vitalIds.forEach((vitalId) => expect(vitalId).toMatch(UUID_PATTERN))
      expect(new Set([...vitalIds, connectionId]).size).toBe(vitals.length + 1)
    })

    it('tracks overlapping connections independently, and never merges them', () => {
      startTracking()
      const socketA = openConnection({ at: 0 })
      const socketB = openConnection({ at: 10 })
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
      const socket = connect()

      startTracking()
      completeHandshake(socket)
      sendMessage(socket, 10)
      receiveMessage(socket, 10)
      callClose(socket)
      dispatchClose(socket)
      tickBeats()

      expect(emittedVitals()).toHaveSize(0)
    })
  })

  // They are what the vital is attributed to a view by, so a closed vital lands on the view that
  // was active when the connection ended rather than on the one it started in.
  describe('the start clocks each vital is handed over with', () => {
    it('are the moment the phase it reports happened', () => {
      startTracking()
      const socket = connect({ at: 5 })
      completeHandshake(socket, { at: 10 })
      tickBeats()
      callClose(socket, { at: WEBSOCKET_HEARTBEAT_INTERVAL + 20 })
      dispatchClose(socket, { at: WEBSOCKET_HEARTBEAT_INTERVAL + 30 })

      expect(emittedStartClocks().map((startClocks) => startClocks.timeStamp)).toEqual([
        clock.timeStamp(5),
        clock.timeStamp(10),
        clock.timeStamp(WEBSOCKET_HEARTBEAT_INTERVAL + 10),
        clock.timeStamp(WEBSOCKET_HEARTBEAT_INTERVAL + 20),
        clock.timeStamp(WEBSOCKET_HEARTBEAT_INTERVAL + 30),
      ])
    })

    it('are the flush date for a connection a flush finalized', () => {
      const tracker = startTracking()
      openConnection()
      advanceTo(40)

      tracker.flushOpenConnections()

      expect(single(emittedStartClocks(WebSocketVitalName.CLOSED)).timeStamp).toBe(clock.timeStamp(40))
    })
  })

  describe('the connecting vital', () => {
    it('is emitted synchronously from the constructor, dated at the call', () => {
      startTracking()

      connect({ at: 40 })

      expect(single(connectingPayloads()).connecting_date).toBe(clock.timeStamp(40))
    })

    it('reports the URL stripped of its query string, including from an encoded path', () => {
      startTracking()
      connect({ url: 'wss://example.com:8443/path/socket%3Froom?token=secret&tenant=acme' })

      expect(single(connectingPayloads()).url).toBe('wss://example.com:8443/path/socket%3Froom')
    })

    it('reports a single requested protocol as a list of one', () => {
      startTracking()
      connect({ protocols: 'auth-token' })

      expect(single(connectingPayloads()).requested_protocols).toEqual(['auth-token'])
    })

    it('reports the requested protocols in the order they were requested', () => {
      startTracking()
      connect({ protocols: ['auth-token', 'chat.v1'] })

      expect(single(connectingPayloads()).requested_protocols).toEqual(['auth-token', 'chat.v1'])
    })

    it('reports no requested protocols when the constructor got none', () => {
      startTracking()
      connect()

      expect(single(connectingPayloads()).requested_protocols).toBeUndefined()
    })
  })

  describe('the open vital', () => {
    it('is emitted on the open event, dated at it and carrying the first snapshot version', () => {
      startTracking()
      const socket = connect()

      completeHandshake(socket, { at: 10 })

      const open = single(openPayloads())
      expect(open.open_date).toBe(clock.timeStamp(10))
      expect(open.snapshot_version).toBe(1)
    })

    it('reports what the server negotiated', () => {
      startTracking()
      const socket = connect()

      completeHandshake(socket, { protocol: 'chat.v1', extensions: 'permessage-deflate' })

      expect(single(openPayloads()).selected_protocol).toBe('chat.v1')
      expect(single(openPayloads()).selected_extensions).toBe('permessage-deflate')
    })

    it('reports no negotiated protocol or extensions when the server selected none', () => {
      startTracking()
      const socket = connect()

      completeHandshake(socket, { protocol: '', extensions: '' })

      expect(single(openPayloads()).selected_protocol).toBeUndefined()
      expect(single(openPayloads()).selected_extensions).toBeUndefined()
    })

    it('is not emitted at all for a handshake that never succeeded', () => {
      startTracking()
      const socket = connect()

      failHandshake(socket)

      expect(emittedVitals().map((vital) => vital.vital.name)).toEqual([
        WebSocketVitalName.CONNECTING,
        WebSocketVitalName.CLOSED,
      ])
    })
  })

  // One flat cadence in every page state, so that a connection held open for an hour is visible
  // while it is open, and one that dies without closing still reports the traffic its last beat
  // carried.
  describe('the open heartbeat', () => {
    /**
     * Watches the intervals scheduled at the heartbeat cadence, which is the only way to tell a
     * heartbeat that was never scheduled from one that beats nothing. The global is patched by hand
     * rather than spied on so that the mocked clock's own teardown, which runs after this one,
     * restores the real timers.
     */
    function watchHeartbeatTimer() {
      const originalSetInterval = globalObject.setInterval
      const originalClearInterval = globalObject.clearInterval
      const pendingIds = new Set<unknown>()
      let scheduledCount = 0

      globalObject.setInterval = (handler: TimerHandler, timeout?: number) => {
        const intervalId = originalSetInterval(handler, timeout)
        if (timeout === WEBSOCKET_HEARTBEAT_INTERVAL) {
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
      const timer = watchHeartbeatTimer()
      startTracking()

      expect(timer.isScheduled()).toBe(false)

      const socketA = openConnection()
      const socketB = openConnection()

      expect(timer.isScheduled()).toBe(true)
      expect(timer.scheduledCount()).toBe(1)

      dispatchClose(socketA)

      expect(timer.isScheduled()).toBe(true)

      dispatchClose(socketB)

      expect(timer.isScheduled()).toBe(false)
    })

    it('schedules the timer again when a connection opens after the last one closed', () => {
      const timer = watchHeartbeatTimer()
      startTracking()
      dispatchClose(openConnection())

      openConnection()
      tickBeats()

      expect(timer.isScheduled()).toBe(true)
      expect(timer.scheduledCount()).toBe(2)
      expect(openPayloads().map((payload) => payload.snapshot_version)).toEqual([1, 1, 2])
    })

    it('beats an open connection once per interval, each beat carrying the next snapshot version', () => {
      startTracking()
      openConnection()

      tickBeats(3)

      expect(openPayloads().map((payload) => payload.snapshot_version)).toEqual([1, 2, 3, 4])
    })

    it('dates every beat at the beat, while still reporting the date the handshake completed', () => {
      startTracking()
      openConnection()

      tickBeats(2)

      expect(emittedVitals(WebSocketVitalName.OPEN).map((vital) => vital.date)).toEqual([
        clock.timeStamp(0),
        clock.timeStamp(WEBSOCKET_HEARTBEAT_INTERVAL),
        clock.timeStamp(2 * WEBSOCKET_HEARTBEAT_INTERVAL),
      ])
      expect(openPayloads().map((payload) => payload.open_date)).toEqual([
        clock.timeStamp(0),
        clock.timeStamp(0),
        clock.timeStamp(0),
      ])
    })

    it('reports on each beat everything exchanged since the connection opened', () => {
      startTracking()
      const socket = openConnection()

      tickBeats()
      receiveMessage(socket, 30)
      tickBeats()

      expect(openPayloads()[1].snapshot.inbound.message_count).toBe(0)
      expect(openPayloads()[2].snapshot.inbound).toEqual(
        jasmine.objectContaining({ message_count: 1, message_size_total: 30 })
      )
    })

    it('beats every open connection on the same tick', () => {
      startTracking()
      openConnection()
      openConnection()

      tickBeats()

      const [idA, idB] = connectingPayloads().map((payload) => payload.id)
      expect(openPayloads().map((payload) => payload.id)).toEqual([idA, idB, idA, idB])
    })

    it('does not beat a connection whose handshake has not completed', () => {
      startTracking()
      connect()

      tickBeats(2)

      expect(openPayloads()).toHaveSize(0)
    })

    it('stops beating a connection once close() started the closing handshake', () => {
      startTracking()
      const socket = openConnection()
      tickBeats()

      callClose(socket)
      tickBeats(2)

      expect(openPayloads()).toHaveSize(2)
    })

    it('stops beating once the last open connection closed', () => {
      startTracking()
      const socket = openConnection()

      dispatchClose(socket)
      tickBeats(3)

      expect(openPayloads()).toHaveSize(1)
    })

    it('keeps beating the connections still open when one of them closes', () => {
      startTracking()
      const socketA = openConnection()
      openConnection()

      dispatchClose(socketA)
      tickBeats()

      const [, idB] = connectingPayloads().map((payload) => payload.id)
      expect(openPayloads().filter((payload) => payload.id === idB)).toHaveSize(2)
      expect(openPayloads()).toHaveSize(3)
    })

    it('stops beating the connections a flush finalized', () => {
      const tracker = startTracking()
      openConnection()

      tracker.flushOpenConnections()
      tickBeats(3)

      expect(openPayloads()).toHaveSize(1)
    })

    it('stops beating after stop()', () => {
      const tracker = startTracking()
      openConnection()

      tracker.stop()
      tickBeats(3)

      expect(openPayloads()).toHaveSize(1)
    })

    // Expected rather than guarded against: one shared timer serves every connection, and both
    // snapshot versions are correct and ordered.
    it('beats a connection twice when it opened just before a tick, with ordered versions', () => {
      startTracking()
      openConnection()
      openConnection({ at: WEBSOCKET_HEARTBEAT_INTERVAL - 1 })

      advanceTo(WEBSOCKET_HEARTBEAT_INTERVAL)

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
      const socket = openConnection()

      callClose(socket, { at: 30 })

      const closing = single(closingPayloads())
      expect(closing.id).toBe(single(connectingPayloads()).id)
      expect(closing.closing_date).toBe(clock.timeStamp(30))
      expect(closing.close_initiator).toBe('client')
    })

    it('is reported between the open and the closed vital', () => {
      startTracking()
      const socket = openConnection()

      callClose(socket)
      dispatchClose(socket)

      expect(emittedVitals().map((vital) => vital.vital.name)).toEqual([
        WebSocketVitalName.CONNECTING,
        WebSocketVitalName.OPEN,
        WebSocketVitalName.CLOSING,
        WebSocketVitalName.CLOSED,
      ])
    })

    it('takes no snapshot version from the sequence the snapshot-carrying vitals share', () => {
      startTracking()
      const socket = openConnection()

      callClose(socket)
      dispatchClose(socket)

      expect(single(openPayloads()).snapshot_version).toBe(1)
      expect(single(closedPayloads()).snapshot_version).toBe(2)
    })

    it('is emitted for a close() during the handshake, whose failure then reports an unclean close', () => {
      startTracking()
      const socket = connect()

      callClose(socket, { at: 5 })
      // the browser fails a connection aborted mid-handshake
      failHandshake(socket, { at: 6 })

      expect(single(closingPayloads()).closing_date).toBe(clock.timeStamp(5))
      expect(single(closedPayloads()).was_clean).toBe(false)
      expect(openPayloads()).toHaveSize(0)
    })
  })

  describe('the closed vital', () => {
    it('reports the close outcome of a real close event, and the event as the reason', () => {
      startTracking()
      const socket = openConnection()

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
      const socket = openConnection()
      socket.bufferedAmount = 128

      dispatchClose(socket)

      expect(single(closedPayloads()).snapshot!.outbound.buffered_amount_at_close).toBe(128)
    })

    it('reports a flush with no close event as the session ending, dated at the flush', () => {
      const tracker = startTracking()
      openConnection()
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
      const socket = openConnection()
      socket.bufferedAmount = 512

      tracker.flushOpenConnections()

      expect(single(closedPayloads()).snapshot!.outbound.buffered_amount_at_close).toBe(512)
    })

    it('starts the snapshot sequence at 1 for a connection that never opened', () => {
      startTracking()
      const socket = connect()

      failHandshake(socket)

      expect(single(closedPayloads()).snapshot_version).toBe(1)
    })

    it('continues the snapshot sequence the open vitals started, so it holds the highest version', () => {
      startTracking()
      const socket = openConnection()
      tickBeats(2)

      dispatchClose(socket)

      expect(openPayloads().map((payload) => payload.snapshot_version)).toEqual([1, 2, 3])
      expect(single(closedPayloads()).snapshot_version).toBe(4)
    })

    it('reports the terminal snapshot of the connection, timed from the open date', () => {
      startTracking()
      const socket = openConnection({ at: 10 })
      receiveMessage(socket, 30, { at: 20 })
      sendMessage(socket, 10, { at: 25, bufferedAmountPreSend: WEBSOCKET_BACKPRESSURE_THRESHOLD_BYTES })

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
          buffered_amount_max: WEBSOCKET_BACKPRESSURE_THRESHOLD_BYTES + 10,
          backpressured_message_count: 1,
        })
      )
    })

    it('counts no outbound message the socket discarded after the closing handshake started', () => {
      startTracking()
      const socket = openConnection()
      sendMessage(socket, 10)
      callClose(socket)

      sendMessage(socket, 500)
      dispatchClose(socket)

      expect(single(closedPayloads()).snapshot!.outbound).toEqual(
        jasmine.objectContaining({ message_count: 1, message_size_total: 10, message_size_max: 10 })
      )
    })
  })

  describe('tracking end', () => {
    it('reports a connection a flush finalized only once, even when its close event arrives later', () => {
      const tracker = startTracking()
      const socket = openConnection()

      tracker.flushOpenConnections()
      dispatchClose(socket)

      expect(closedPayloads()).toHaveSize(1)
    })

    it('reports nothing more once stopped', () => {
      const tracker = startTracking()
      const socket = connect()

      tracker.stop()
      dispatchClose(socket)

      expect(closedPayloads()).toHaveSize(0)
    })
  })

  describe('startWebSocketCollection', () => {
    let pageUnloadFlushObservable: Observable<void>

    beforeEach(() => {
      pageUnloadFlushObservable = new Observable<void>()
    })

    function startCollection(configuration = mockRumConfiguration({ betaTrackWebSockets: true })) {
      const collection = startWebSocketCollection(
        lifeCycle,
        configuration,
        addWebSocketVitalSpy,
        pageUnloadFlushObservable
      )
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
          dispatchClose(openConnection())

          expect(emittedVitals()).toHaveSize(collects ? 3 : 0)
        })
      })
    })

    // Unlike view tracking, which filters to the unloading reason: a view survives a background
    // transition, a connection may not, and hidden is the only signal mobile browsers guarantee at
    // that point.
    describe('the background-transition beat', () => {
      ;[PageExitReason.HIDDEN, PageExitReason.FROZEN, PageExitReason.UNLOADING].forEach((reason) => {
        it(`beats every open connection on a "${reason}" transition`, () => {
          startCollection()
          openConnection()
          openConnection()

          lifeCycle.notify(LifeCycleEventType.PREPARE_URGENT_FLUSH, reason)

          const [idA, idB] = connectingPayloads().map((payload) => payload.id)
          expect(openPayloads().map((payload) => payload.id)).toEqual([idA, idB, idA, idB])
          expect(openPayloads().map((payload) => payload.snapshot_version)).toEqual([1, 1, 2, 2])
        })
      })

      it('does not beat a connection that is not open', () => {
        startCollection()
        connect()

        lifeCycle.notify(LifeCycleEventType.PREPARE_URGENT_FLUSH, PageExitReason.HIDDEN)

        expect(openPayloads()).toHaveSize(0)
      })

      it('stops beating after stop()', () => {
        const collection = startCollection()
        openConnection()

        collection.stop()
        lifeCycle.notify(LifeCycleEventType.PREPARE_URGENT_FLUSH, PageExitReason.HIDDEN)

        expect(openPayloads()).toHaveSize(1)
      })
    })

    describe('the page unload', () => {
      it('ends tracking of an open connection when the page is not coming back', () => {
        startCollection()
        openConnection()
        advanceTo(40)

        hidePage({ persisted: false })

        expect(single(closedPayloads())).toEqual(
          jasmine.objectContaining({
            tracking_end_reason: WebSocketTrackingEndReason.PAGE_UNLOADED,
            closed_date: clock.timeStamp(40),
          })
        )
      })

      it('ends tracking of every connection, whatever its phase', () => {
        startCollection()
        connect()
        openConnection()
        callClose(openConnection())

        hidePage({ persisted: false })

        expect(closedPayloads().map((payload) => payload.tracking_end_reason)).toEqual([
          WebSocketTrackingEndReason.PAGE_UNLOADED,
          WebSocketTrackingEndReason.PAGE_UNLOADED,
          WebSocketTrackingEndReason.PAGE_UNLOADED,
        ])
      })

      it('reports no close outcome, the next snapshot version and the send queue depth read from the socket', () => {
        startCollection()
        const socket = openConnection()
        socket.bufferedAmount = 12

        hidePage({ persisted: false })

        const payload = single(closedPayloads())
        expect(payload).toEqual(jasmine.objectContaining({ snapshot_version: 2 }))
        expect(payload.snapshot?.outbound.buffered_amount_at_close).toBe(12)
        expect(payload.close_code).toBeUndefined()
        expect(payload.close_reason).toBeUndefined()
        expect(payload.was_clean).toBeUndefined()
      })

      it('reports nothing more for a connection whose close event arrives after the page unloaded', () => {
        startCollection()
        const socket = openConnection()

        hidePage({ persisted: false })
        dispatchClose(socket)

        expect(single(closedPayloads()).tracking_end_reason).toBe(WebSocketTrackingEndReason.PAGE_UNLOADED)
      })

      it('reports nothing more for a connection that closed before the page unloaded', () => {
        startCollection()
        dispatchClose(openConnection())

        hidePage({ persisted: false })

        expect(single(closedPayloads()).tracking_end_reason).toBe(WebSocketTrackingEndReason.CLOSE_EVENT)
      })

      it('stops beating the connections it ended', () => {
        startCollection()
        openConnection()

        hidePage({ persisted: false })
        tickBeats()

        expect(openPayloads()).toHaveSize(1)
      })

      it('asks for a flush once every connection it ended was reported', () => {
        const closedCountsAtFlush: number[] = []
        pageUnloadFlushObservable.subscribe(() => closedCountsAtFlush.push(closedPayloads().length))
        startCollection()
        openConnection()
        openConnection()

        hidePage({ persisted: false })

        expect(closedCountsAtFlush).toEqual([2])
      })

      it('asks for no flush when it had no connection to end', () => {
        const flushSpy = jasmine.createSpy()
        pageUnloadFlushObservable.subscribe(flushSpy)
        startCollection()
        dispatchClose(openConnection())

        hidePage({ persisted: false })

        expect(flushSpy).not.toHaveBeenCalled()
      })

      // the connection may survive in the back/forward cache, so it is left to speak for itself
      it('does not end tracking when the page goes into the back/forward cache', () => {
        startCollection()
        openConnection()

        hidePage({ persisted: true })

        expect(closedPayloads()).toHaveSize(0)
      })
    })

    it('finalizes open connections when the session expires', () => {
      startCollection()
      connect()
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
      const socket = openConnection()
      sendMessage(socket, 10)

      expireSession()

      expect(closedPayloads()).toHaveSize(1)

      sendMessage(socket, 7)
      dispatchClose(socket)

      expect(closedPayloads()).toHaveSize(1)
    })

    it('finalizes open connections on stop(), then ignores their events', () => {
      const collection = startCollection()
      const socket = openConnection()
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

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  function startTracking() {
    const tracker = trackWebSocket(initWebSocketObservable(), addWebSocketVitalSpy)
    registerCleanupTask(tracker.stop)
    return tracker
  }

  function expireSession(endClocks = clocksNow()) {
    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, { endClocks })
  }

  /** The browser hiding the page, either for good or into the back/forward cache. */
  function hidePage({ persisted }: { persisted: boolean }) {
    window.dispatchEvent(createNewEvent(DOM_EVENT.PAGE_HIDE, { persisted }))
  }

  // ---------------------------------------------------------------------------
  // Driving time
  //
  // Dates are given in milliseconds since the spec started, and only ever move forward: time is
  // ticked rather than set, so that the heartbeat timer fires on the way like it would in a browser.
  // ---------------------------------------------------------------------------

  /** Moves time forward to `at`, or leaves it where it is when no date is given. */
  function advanceTo(at: number | undefined) {
    if (at === undefined) {
      return
    }
    const now = Date.now() - clock.timeStamp(0)
    if (at < now) {
      throw new Error(`Cannot move time back from ${now} to ${at}`)
    }
    clock.tick(at - now)
  }

  function tickBeats(count = 1) {
    clock.tick(count * WEBSOCKET_HEARTBEAT_INTERVAL)
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

  function connect({
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
  function openConnection({ at, url }: At & { url?: string } = {}) {
    const socket = connect({ at, url })
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

  function emittedCalls(name?: WebSocketVitalName) {
    const calls = addWebSocketVitalSpy.calls.all().map((call) => call.args)
    return name === undefined ? calls : calls.filter(([rawRumEvent]) => rawRumEvent.vital.name === name)
  }

  function emittedVitals(name?: WebSocketVitalName) {
    return emittedCalls(name).map(([rawRumEvent]) => rawRumEvent)
  }

  function emittedStartClocks(name?: WebSocketVitalName) {
    return emittedCalls(name).map(([, startClocks]) => startClocks)
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
      (vital) => vital.vital.websocket as { id: string } & RawRumWebSocketConnectingVitalProperties
    )
  }

  function openPayloads() {
    return emittedVitals(WebSocketVitalName.OPEN).map(
      (vital) => vital.vital.websocket as { id: string } & RawRumWebSocketOpenVitalProperties
    )
  }

  function closingPayloads() {
    return emittedVitals(WebSocketVitalName.CLOSING).map(
      (vital) => vital.vital.websocket as { id: string } & RawRumWebSocketClosingVitalProperties
    )
  }

  function closedPayloads() {
    return emittedVitals(WebSocketVitalName.CLOSED).map(
      (vital) => vital.vital.websocket as { id: string } & RawRumWebSocketClosedVitalProperties
    )
  }
})

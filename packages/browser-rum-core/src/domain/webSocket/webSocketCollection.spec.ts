import type { BufferedData } from '@datadog/browser-core'
import {
  addExperimentalFeatures,
  BufferedDataType,
  ExperimentalFeature,
  initWebSocketObservable,
  Observable,
  resetAllowUntrustedEvents,
  setAllowUntrustedEvents,
  startBufferingData,
} from '@datadog/browser-core'
import {
  collectAsyncCalls,
  createMockWebSocket,
  mockClock,
  mockWebSocket,
  registerCleanupTask,
  type Clock,
  type MockWebSocket,
} from '@datadog/browser-core/test'
import { relativeToClocks } from '@datadog/js-core/time'
import { mockRumConfiguration } from '../../../test'
import type {
  RawRumWebSocketClosedVitalProperties,
  RawRumWebSocketClosingVitalProperties,
  RawRumWebSocketConnectingVitalProperties,
  RawRumWebSocketOpenVitalProperties,
  RawRumWebSocketVitalEvent,
} from '../../rawRumEvent.types'
import { VitalType, WebSocketTrackingEndReason, WebSocketVitalName } from '../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { AddWebSocketVital } from './webSocketCollection'
import { startWebSocketCollection, trackWebSocket } from './webSocketCollection'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('webSocketCollection', () => {
  let lifeCycle: LifeCycle
  let addWebSocketVitalSpy: jasmine.Spy<AddWebSocketVital>
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    mockWebSocket()
    setAllowUntrustedEvents(true)
    lifeCycle = new LifeCycle()
    addWebSocketVitalSpy = jasmine.createSpy()
    registerCleanupTask(resetAllowUntrustedEvents)
  })

  function expireSession(endClocks = relativeToClocks(clock.relative(0))) {
    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, { endClocks })
  }

  // Feeds WebSocket instrumentation into a plain `BufferedData` observable, so that specs keep
  // driving real sockets while observing the events synchronously. `startBufferingData` is used
  // instead where the asynchronous buffer replay is what is under test.
  function createWebSocketDataObservable() {
    const observable = new Observable<BufferedData>()
    const subscription = initWebSocketObservable().subscribe((data) =>
      observable.notify({ type: BufferedDataType.WEB_SOCKET, data })
    )
    registerCleanupTask(() => subscription.unsubscribe())
    return observable
  }

  function startTracking() {
    const tracker = trackWebSocket(createWebSocketDataObservable(), addWebSocketVitalSpy)
    registerCleanupTask(tracker.stop)
    return tracker
  }

  function emittedVitals(name?: WebSocketVitalName) {
    const vitals = addWebSocketVitalSpy.calls.all().map((call) => call.args[0])
    return name === undefined ? vitals : vitals.filter((vital) => vital.vital.name === name)
  }

  function emittedNames() {
    return emittedVitals().map((vital) => vital.vital.name)
  }

  /** When the seam was told the vital was taken, which is what assembly attributes it by. */
  function startClocksOf(vital: RawRumWebSocketVitalEvent) {
    return addWebSocketVitalSpy.calls.all().find((call) => call.args[0] === vital)!.args[1]
  }

  // The payload of a phase is picked by the name the collection module chose; the serializer's own
  // spec is where the compiler checks that a name and its payload agree.
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

  /** The connection ids reported by every vital, in emission order. */
  function connectionIds() {
    return emittedVitals().map((vital) => vital.vital.websocket.id)
  }

  function notifyConnecting(startRelative = 0, url = 'wss://example.com/socket', protocols?: string | string[]) {
    setClock(startRelative)
    return createMockWebSocket(url, protocols)
  }

  function notifyOpen(socket: MockWebSocket, openRelative = 10, protocol = '', extensions = '') {
    setClock(openRelative)
    socket.protocol = protocol
    socket.extensions = extensions
    socket.simulateOpen()
  }

  function notifyMessageIn(socket: MockWebSocket, at: number, size: number) {
    setClock(at)
    socket.simulateMessage('x'.repeat(size))
  }

  function notifyMessageOut(socket: MockWebSocket, at: number, size: number, bufferedAmountPreSend = 0) {
    setClock(at)
    socket.bufferedAmount = bufferedAmountPreSend
    socket.send('x'.repeat(size))
  }

  /** Drives the application calling `close()`, which is the only way the CLOSING phase is observed. */
  function notifyClosing(socket: MockWebSocket, at: number, code?: number, reason?: string) {
    setClock(at)
    socket.close(code, reason)
  }

  function notifyClosed(socket: MockWebSocket, at: number, code: number, reason: string, wasClean: boolean) {
    setClock(at)
    socket.simulateClose(code, reason, wasClean)
  }

  function setClock(relative: number) {
    clock.setDate(new Date(clock.timeStamp(relative)))
  }

  it('reports every vital of a connection under the same connection id', () => {
    startTracking()
    const socket = notifyConnecting()
    notifyOpen(socket, 10)
    notifyClosed(socket, 20, 1000, 'bye', true)

    expect(emittedNames()).toEqual([WebSocketVitalName.CONNECTING, WebSocketVitalName.OPEN, WebSocketVitalName.CLOSED])
    expect(new Set(connectionIds()).size).toBe(1)
    expect(connectingPayloads()[0].id).toMatch(UUID_PATTERN)
  })

  it('generates a unique connection id per connection', () => {
    startTracking()
    const firstSocket = notifyConnecting()
    notifyClosed(firstSocket, 1, 1000, 'reason_a', true)

    const secondSocket = notifyConnecting()
    notifyClosed(secondSocket, 1, 1000, 'reason_b', true)

    const [firstId, secondId] = connectingPayloads().map((payload) => payload.id)
    expect(secondId).not.toBe(firstId)
  })

  it('tracks overlapping connections independently, and never merges them', () => {
    const urlA = 'wss://example.com/socket-a'
    const urlB = 'wss://example.com/socket-b'

    startTracking()

    const socketA = notifyConnecting(0, urlA)
    notifyOpen(socketA, 5)

    const socketB = notifyConnecting(10, urlB)
    notifyOpen(socketB, 15)

    notifyClosed(socketA, 30, 1000, 'bye-a', true)

    expect(closedPayloads()).toHaveSize(1)
    expect(closedPayloads()[0].id).toBe(connectingPayloads()[0].id)

    notifyClosed(socketB, 40, 1000, 'bye-b', true)

    expect(closedPayloads()).toHaveSize(2)
    expect(closedPayloads()[1].id).toBe(connectingPayloads()[1].id)
    expect(closedPayloads()[1].id).not.toBe(closedPayloads()[0].id)
    expect(connectingPayloads().map((payload) => payload.url)).toEqual([urlA, urlB])
    expect(closedPayloads()[0].closed_date).toBeLessThan(closedPayloads()[1].closed_date)
  })

  it('flushOpenConnections finalizes still-open connections', () => {
    const tracker = startTracking()
    const socket = notifyConnecting()
    notifyOpen(socket, 10)
    notifyMessageIn(socket, 20, 1)

    tracker.flushOpenConnections()

    expect(closedPayloads()).toHaveSize(1)
  })

  it('does not finalize twice when close arrives after flushOpenConnections', () => {
    const tracker = startTracking()
    const socket = notifyConnecting()
    notifyOpen(socket, 10)
    tracker.flushOpenConnections()
    notifyClosed(socket, 20, 1000, 'bye', true)

    expect(closedPayloads()).toHaveSize(1)
  })

  it('stop() unsubscribes from the observable and ignores further events', () => {
    const tracker = startTracking()
    const socket = notifyConnecting()
    tracker.stop()
    notifyClosed(socket, 20, 1000, 'bye', true)

    expect(closedPayloads()).toHaveSize(0)
  })

  it('reaches the event pipeline only through the WebSocket vital seam', () => {
    const rawRumEventSpy = jasmine.createSpy()
    lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rawRumEventSpy)
    startTracking()

    const socket = notifyConnecting()
    notifyOpen(socket, 10)
    notifyClosed(socket, 20, 1000, 'bye', true)

    expect(addWebSocketVitalSpy).toHaveBeenCalledTimes(3)
    expect(rawRumEventSpy).not.toHaveBeenCalled()
  })

  describe('the connecting vital', () => {
    it('is emitted exactly once, synchronously from the constructor', () => {
      startTracking()

      notifyConnecting()

      expect(addWebSocketVitalSpy).toHaveBeenCalledTimes(1)
      expect(emittedVitals()[0].vital).toEqual(
        jasmine.objectContaining({ type: VitalType.WEBSOCKET, name: WebSocketVitalName.CONNECTING })
      )
    })

    it('uses a fresh vital id, distinct from the connection id', () => {
      startTracking()
      notifyConnecting()

      const vital = emittedVitals()[0].vital
      expect(vital.id).toMatch(UUID_PATTERN)
      expect(vital.id).not.toBe(vital.websocket.id)
    })

    it('is attributed to the moment the constructor was called', () => {
      startTracking()
      notifyConnecting(40)

      const connectingClocks = relativeToClocks(clock.relative(40))
      expect(startClocksOf(emittedVitals()[0])).toEqual(connectingClocks)
      expect(connectingPayloads()[0].connecting_date).toBe(connectingClocks.timeStamp)
    })

    it('reports the URL stripped of its query string, including from an encoded path', () => {
      startTracking()
      notifyConnecting(0, 'wss://example.com:8443/path/socket%3Froom?token=secret&tenant=acme')

      expect(connectingPayloads()[0].url).toBe('wss://example.com:8443/path/socket%3Froom')
    })

    it('reports a single requested protocol as a list of one', () => {
      startTracking()
      notifyConnecting(0, 'wss://example.com/socket', 'auth-token')

      expect(connectingPayloads()[0].requested_protocols).toEqual(['auth-token'])
    })

    it('reports the requested protocols in the order they were requested', () => {
      startTracking()
      notifyConnecting(0, 'wss://example.com/socket', ['auth-token', 'chat.v1'])

      expect(connectingPayloads()[0].requested_protocols).toEqual(['auth-token', 'chat.v1'])
    })

    it('reports no requested protocols when the constructor got none', () => {
      startTracking()
      notifyConnecting()

      expect(connectingPayloads()[0].requested_protocols).toBeUndefined()
    })
  })

  describe('the open vital', () => {
    it('is emitted once on the open event, carrying the first snapshot of the connection', () => {
      startTracking()
      const socket = notifyConnecting()

      notifyOpen(socket, 10)

      expect(openPayloads()).toHaveSize(1)
      expect(openPayloads()[0].snapshot_version).toBe(1)
      expect(openPayloads()[0].snapshot).toBeDefined()
      expect(openPayloads()[0].open_date).toBe(clock.timeStamp(10))
      expect(startClocksOf(emittedVitals(WebSocketVitalName.OPEN)[0])).toEqual(relativeToClocks(clock.relative(10)))
    })

    it('reports what the server negotiated', () => {
      startTracking()
      const socket = notifyConnecting()

      notifyOpen(socket, 10, 'chat.v1', 'permessage-deflate')

      expect(openPayloads()[0].selected_protocol).toBe('chat.v1')
      expect(openPayloads()[0].selected_extensions).toBe('permessage-deflate')
    })

    it('reports the messages exchanged before the handshake completed as nothing exchanged', () => {
      startTracking()
      const socket = notifyConnecting()

      notifyOpen(socket, 10)

      expect(openPayloads()[0].snapshot.inbound.message_count).toBe(0)
      expect(openPayloads()[0].snapshot.outbound.message_count).toBe(0)
    })

    it('is not emitted at all for a handshake that never succeeded', () => {
      startTracking()
      const socket = notifyConnecting()

      notifyClosed(socket, 20, 1006, '', false)

      expect(openPayloads()).toHaveSize(0)
      expect(emittedNames()).toEqual([WebSocketVitalName.CONNECTING, WebSocketVitalName.CLOSED])
    })
  })

  describe('the closing vital', () => {
    it('is emitted on the close() call, carrying the closing date and the client as the initiator', () => {
      startTracking()
      const socket = notifyConnecting()
      notifyOpen(socket, 10)

      notifyClosing(socket, 30)

      expect(closingPayloads()).toHaveSize(1)
      expect(closingPayloads()[0].closing_date).toBe(clock.timeStamp(30))
      expect(closingPayloads()[0].close_initiator).toBe('client')
      expect(closingPayloads()[0].id).toBe(connectingPayloads()[0].id)
      expect(startClocksOf(emittedVitals(WebSocketVitalName.CLOSING)[0])).toEqual(relativeToClocks(clock.relative(30)))
    })

    it('carries no cleanliness and no snapshot: neither is knowable before the handshake completes', () => {
      startTracking()
      const socket = notifyConnecting()
      notifyOpen(socket, 10)
      notifyMessageIn(socket, 20, 30)

      notifyClosing(socket, 30)

      expect(Object.keys(closingPayloads()[0])).toEqual(['id', 'closing_date', 'close_initiator'])
    })

    it('is reported between the open and the closed vital', () => {
      startTracking()
      const socket = notifyConnecting()
      notifyOpen(socket, 10)

      notifyClosing(socket, 30)
      notifyClosed(socket, 40, 1000, 'bye', true)

      expect(emittedNames()).toEqual([
        WebSocketVitalName.CONNECTING,
        WebSocketVitalName.OPEN,
        WebSocketVitalName.CLOSING,
        WebSocketVitalName.CLOSED,
      ])
    })

    it('takes no snapshot version from the sequence the snapshot-carrying vitals share', () => {
      startTracking()
      const socket = notifyConnecting()
      notifyOpen(socket, 10)

      notifyClosing(socket, 30)
      notifyClosed(socket, 40, 1000, 'bye', true)

      expect(openPayloads()[0].snapshot_version).toBe(1)
      expect(closedPayloads()[0].snapshot_version).toBe(2)
    })

    it('is emitted for a close() during the handshake, whose failure then reports an unclean close', () => {
      startTracking()
      const socket = notifyConnecting()

      notifyClosing(socket, 5)
      // the browser fails a connection aborted mid-handshake
      notifyClosed(socket, 6, 1006, '', false)

      expect(closingPayloads()).toHaveSize(1)
      expect(closingPayloads()[0].closing_date).toBe(clock.timeStamp(5))
      expect(closedPayloads()[0].was_clean).toBe(false)
      expect(openPayloads()).toHaveSize(0)
    })

    it('is emitted once for a double close()', () => {
      startTracking()
      const socket = notifyConnecting()
      notifyOpen(socket, 10)

      notifyClosing(socket, 30)
      notifyClosing(socket, 31)

      expect(closingPayloads()).toHaveSize(1)
      expect(closingPayloads()[0].closing_date).toBe(clock.timeStamp(30))
    })

    it('is not emitted for a close() on an already closed socket', () => {
      startTracking()
      const socket = notifyConnecting()
      notifyOpen(socket, 10)
      notifyClosed(socket, 40, 1000, 'bye', true)

      notifyClosing(socket, 50)

      expect(closingPayloads()).toHaveSize(0)
    })

    it('is not emitted for a connection the server closed', () => {
      startTracking()
      const socket = notifyConnecting()
      notifyOpen(socket, 10)

      notifyClosed(socket, 40, 1000, 'bye', true)

      expect(closingPayloads()).toHaveSize(0)
    })
  })

  describe('the closed vital', () => {
    it('reports the close outcome of a real close event, and the event as the reason', () => {
      startTracking()
      const socket = notifyConnecting()
      notifyOpen(socket, 10)

      notifyClosed(socket, 40, 1001, 'going away', false)

      expect(closedPayloads()).toHaveSize(1)
      expect(closedPayloads()[0]).toEqual(
        jasmine.objectContaining({
          tracking_end_reason: WebSocketTrackingEndReason.CLOSE_EVENT,
          close_code: 1001,
          close_reason: 'going away',
          was_clean: false,
        })
      )
      expect(closedPayloads()[0].closed_date).toBe(clock.timeStamp(40))
      expect(startClocksOf(emittedVitals(WebSocketVitalName.CLOSED)[0])).toEqual(relativeToClocks(clock.relative(40)))
    })

    it('reports an empty close reason rather than nothing when the peer supplied none', () => {
      startTracking()
      const socket = notifyConnecting()
      notifyOpen(socket, 10)

      notifyClosed(socket, 40, 1000, '', true)

      expect(closedPayloads()[0].close_reason).toBe('')
    })

    it('reports the send queue depth the close event carried', () => {
      startTracking()
      const socket = notifyConnecting()
      notifyOpen(socket, 10)
      notifyMessageOut(socket, 20, 10)
      socket.bufferedAmount = 128

      notifyClosed(socket, 40, 1000, 'bye', true)

      expect(closedPayloads()[0].snapshot!.outbound.buffered_amount_at_close).toBe(128)
    })

    it('reports a flush with no close event as the session ending, and no close outcome', () => {
      const tracker = startTracking()
      const endClocks = relativeToClocks(clock.relative(40))
      const socket = notifyConnecting()
      notifyOpen(socket, 10)

      tracker.flushOpenConnections(endClocks)

      expect(closedPayloads()[0].tracking_end_reason).toBe(WebSocketTrackingEndReason.SESSION_END)
      expect(closedPayloads()[0].close_code).toBeUndefined()
      expect(closedPayloads()[0].close_reason).toBeUndefined()
      expect(closedPayloads()[0].was_clean).toBeUndefined()
      expect(startClocksOf(emittedVitals(WebSocketVitalName.CLOSED)[0])).toEqual(endClocks)
    })

    it('reports the send queue depth read from the socket when no close event was received', () => {
      const tracker = startTracking()
      const socket = notifyConnecting()
      notifyOpen(socket, 10)
      notifyMessageOut(socket, 20, 10, 2_048)
      socket.bufferedAmount = 512

      tracker.flushOpenConnections()

      expect(closedPayloads()[0].snapshot!.outbound.buffered_amount_at_close).toBe(512)
    })

    it('reports no snapshot for a connection that never opened, at version 1', () => {
      startTracking()
      const socket = notifyConnecting()

      notifyClosed(socket, 20, 1006, '', false)

      expect(closedPayloads()[0].snapshot).toBeUndefined()
      expect(closedPayloads()[0].snapshot_version).toBe(1)
    })

    it('continues the snapshot sequence the open vital started, so it holds the highest version', () => {
      startTracking()
      const socket = notifyConnecting()
      notifyOpen(socket, 10)

      notifyClosed(socket, 40, 1000, 'bye', true)

      expect(openPayloads()[0].snapshot_version).toBe(1)
      expect(closedPayloads()[0].snapshot_version).toBe(2)
    })

    it('reports the terminal snapshot of the connection', () => {
      startTracking()
      const socket = notifyConnecting()
      notifyOpen(socket, 10)
      notifyMessageIn(socket, 20, 30)
      notifyMessageOut(socket, 25, 10)

      notifyClosed(socket, 40, 1000, 'bye', true)

      expect(closedPayloads()[0].snapshot!.inbound).toEqual(
        jasmine.objectContaining({ message_count: 1, message_size_total: 30 })
      )
      expect(closedPayloads()[0].snapshot!.outbound).toEqual(
        jasmine.objectContaining({ message_count: 1, message_size_total: 10 })
      )
    })
  })

  describe('startWebSocketCollection', () => {
    function startCollection(
      configuration = mockRumConfiguration({ betaTrackWebSockets: true }),
      bufferedDataObservable = createWebSocketDataObservable()
    ) {
      const collection = startWebSocketCollection(
        lifeCycle,
        configuration,
        addWebSocketVitalSpy,
        bufferedDataObservable
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
          const socket = notifyConnecting()
          notifyOpen(socket, 10)
          notifyClosed(socket, 20, 1000, 'bye', true)

          expect(emittedVitals()).toHaveSize(collects ? 3 : 0)
        })
      })

      it('does not subscribe to the buffered data observable when the gate is closed', () => {
        const bufferedDataObservable = createWebSocketDataObservable()
        const subscribeSpy = spyOn(bufferedDataObservable, 'subscribe').and.callThrough()

        startCollection(
          mockRumConfiguration({ trackResources: true, betaTrackWebSockets: false }),
          bufferedDataObservable
        )

        expect(subscribeSpy).not.toHaveBeenCalled()
      })
    })

    // WebSocket activity is instrumented and buffered from SDK load; collection only subscribes at
    // init(), and receives everything that happened before as a replayed burst.
    describe('connections started before collection subscribed', () => {
      let bufferedDataObservable: Observable<BufferedData>

      beforeEach(() => {
        const buffering = startBufferingData()
        bufferedDataObservable = buffering.observable
        registerCleanupTask(buffering.stop)
      })

      function subscribeCollection(addWebSocketVital: AddWebSocketVital = addWebSocketVitalSpy) {
        const collection = startWebSocketCollection(
          lifeCycle,
          mockRumConfiguration({ betaTrackWebSockets: true }),
          addWebSocketVital,
          bufferedDataObservable
        )
        registerCleanupTask(() => collection.stop())
      }

      it('reconstructs a connection that also completed before collection subscribed', async () => {
        const socket = notifyConnecting(0)
        notifyOpen(socket, 10)
        notifyMessageIn(socket, 20, 30)
        notifyClosed(socket, 40, 1000, 'bye', true)

        subscribeCollection()
        await collectAsyncCalls(addWebSocketVitalSpy, 3)

        expect(emittedNames()).toEqual([
          WebSocketVitalName.CONNECTING,
          WebSocketVitalName.OPEN,
          WebSocketVitalName.CLOSED,
        ])
        // dated from the real close, not from the subscription
        expect(closedPayloads()[0].closed_date).toBe(clock.timeStamp(40))
        expect(startClocksOf(emittedVitals(WebSocketVitalName.CLOSED)[0])).toEqual(relativeToClocks(clock.relative(40)))
        expect(closedPayloads()[0].snapshot!.inbound.message_count).toBe(1)
      })

      it('reports a connection spanning the subscription exactly once', async () => {
        const replayedUrl = 'wss://example.com/replayed'
        const socket = notifyConnecting(0)
        notifyOpen(socket, 10)
        notifyMessageIn(socket, 20, 30)

        // a connection that completed early gives a deterministic signal that the replay is over:
        // it reports both of its vitals and, being closed, can never report again
        const replayedSocket = notifyConnecting(21, replayedUrl)
        notifyClosed(replayedSocket, 22, 1000, 'bye', true)
        const replaySpy = jasmine.createSpy<AddWebSocketVital>()
        let replayedConnectionId: string | undefined

        subscribeCollection((vital, startClocks) => {
          addWebSocketVitalSpy(vital, startClocks)
          if (vital.vital.name === WebSocketVitalName.CONNECTING && vital.vital.websocket.url === replayedUrl) {
            replayedConnectionId = vital.vital.websocket.id
          }
          if (vital.vital.websocket.id === replayedConnectionId) {
            replaySpy(vital, startClocks)
          }
        })
        await collectAsyncCalls(replaySpy, 2)

        notifyMessageIn(socket, 50, 5)
        notifyClosed(socket, 60, 1000, 'bye', true)

        expect(emittedVitals(WebSocketVitalName.CONNECTING)).toHaveSize(2)
        expect(closedPayloads()).toHaveSize(2)
        expect(closedPayloads()[1].id).toBe(connectingPayloads()[0].id)
        // the whole span of the connection is reconstructed, both sides of the subscription
        expect(closedPayloads()[1].snapshot!.inbound.message_count).toBe(2)
      })

      it('keeps a distinct connection id per early connection and reports both of their vitals', async () => {
        const firstSocket = notifyConnecting(0, 'wss://example.com/socket-a')
        const secondSocket = notifyConnecting(5, 'wss://example.com/socket-b')
        notifyClosed(firstSocket, 10, 1000, 'bye-a', true)
        notifyClosed(secondSocket, 20, 1000, 'bye-b', true)

        subscribeCollection()
        await collectAsyncCalls(addWebSocketVitalSpy, 4)

        const [firstId, secondId] = connectingPayloads().map((payload) => payload.id)
        expect(firstId).not.toBe(secondId)

        expect(emittedNames()).toEqual([
          WebSocketVitalName.CONNECTING,
          WebSocketVitalName.CONNECTING,
          WebSocketVitalName.CLOSED,
          WebSocketVitalName.CLOSED,
        ])
      })
    })

    it('finalizes open connections when the session expires', () => {
      const endClocks = relativeToClocks(clock.relative(40))
      startCollection()
      notifyConnecting()

      expireSession(endClocks)

      expect(closedPayloads()).toHaveSize(1)
      expect(closedPayloads()[0].tracking_end_reason).toBe(WebSocketTrackingEndReason.SESSION_END)
      expect(startClocksOf(emittedVitals(WebSocketVitalName.CLOSED)[0])).toEqual(endClocks)
    })

    it('ignores further WebSocket events from the same instance after stop()', () => {
      const collection = startCollection()
      const socket = notifyConnecting()
      collection.stop()

      const vitalCountAfterStop = emittedVitals().length

      notifyClosed(socket, 1000, 1000, 'bye', true)

      expect(emittedVitals()).toHaveSize(vitalCountAfterStop)
    })

    it('ignores further WebSocket events from the same instance after the session expires', () => {
      startCollection()
      const socket = notifyConnecting()
      notifyOpen(socket, 10)
      notifyMessageOut(socket, 20, 10)

      expireSession()

      expect(closedPayloads()).toHaveSize(1)

      notifyMessageOut(socket, 40, 7)
      notifyClosed(socket, 50, 1000, 'bye', true)

      expect(closedPayloads()).toHaveSize(1)
    })
  })
})

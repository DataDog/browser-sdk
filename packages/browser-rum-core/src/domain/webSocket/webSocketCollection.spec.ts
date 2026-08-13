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
import type { Duration } from '@datadog/js-core/time'
import { relativeToClocks } from '@datadog/js-core/time'
import { mockRumConfiguration, mockViewHistory } from '../../../test'
import { VitalType } from '../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { DurationVital } from '../vital/vitalCollection'
import {
  startWebSocketCollection,
  trackWebSocket,
  WEBSOCKET_CLOSED_VITAL_NAME,
  WEBSOCKET_CONNECTING_VITAL_NAME,
} from './webSocketCollection'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('webSocketCollection', () => {
  let lifeCycle: LifeCycle
  let addDurationVitalSpy: jasmine.Spy<(vital: DurationVital) => void>
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    mockWebSocket()
    setAllowUntrustedEvents(true)
    lifeCycle = new LifeCycle()
    addDurationVitalSpy = jasmine.createSpy()
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
    const tracker = trackWebSocket(createWebSocketDataObservable(), mockViewHistory(), addDurationVitalSpy)
    registerCleanupTask(tracker.stop)
    return tracker
  }

  function emittedVitals(name?: string) {
    const vitals = addDurationVitalSpy.calls.all().map((call) => call.args[0])
    return name === undefined ? vitals : vitals.filter((vital) => vital.name === name)
  }

  function connectingVitals() {
    return emittedVitals(WEBSOCKET_CONNECTING_VITAL_NAME)
  }

  function closedVitals() {
    return emittedVitals(WEBSOCKET_CLOSED_VITAL_NAME)
  }

  function vitalContext(vital: DurationVital) {
    return vital.context as { url: string; connection_id: string }
  }

  function connectionIds(vitals: DurationVital[]) {
    return vitals.map((vital) => vitalContext(vital).connection_id)
  }

  function notifyConnecting(startRelative = 0, url = 'wss://example.com/socket', protocols?: string | string[]) {
    setClock(startRelative)
    return createMockWebSocket(url, protocols)
  }

  function notifyOpen(socket: MockWebSocket, openRelative = 10, protocol = '') {
    setClock(openRelative)
    socket.protocol = protocol
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

  function notifyClosed(socket: MockWebSocket, at: number, code: number, reason: string, wasClean: boolean) {
    setClock(at)
    socket.simulateClose(code, reason, wasClean)
  }

  function setClock(relative: number) {
    clock.setDate(new Date(clock.timeStamp(relative)))
  }

  it('generates a unique connection_id per connection', () => {
    startTracking()
    const firstSocket = notifyConnecting()
    notifyClosed(firstSocket, 1, 1000, 'reason_a', true)

    const secondSocket = notifyConnecting()
    notifyClosed(secondSocket, 1, 1000, 'reason_b', true)

    const [firstId, secondId] = connectionIds(connectingVitals())
    expect(secondId).not.toBe(firstId)
  })

  it('tracks overlapping connections independently with unique connection_ids', () => {
    const urlA = 'wss://example.com/socket-a'
    const urlB = 'wss://example.com/socket-b'

    startTracking()

    const socketA = notifyConnecting(0, urlA)
    notifyOpen(socketA, 5)

    const socketB = notifyConnecting(10, urlB)
    notifyOpen(socketB, 15)

    notifyClosed(socketA, 30, 1000, 'bye-a', true)

    expect(closedVitals()).toHaveSize(1)
    expect(closedVitals()[0].context.url).toBe(urlA)

    notifyClosed(socketB, 40, 1000, 'bye-b', true)

    expect(closedVitals()).toHaveSize(2)
    expect(closedVitals()[1].context.url).toBe(urlB)
    expect(closedVitals()[1].context.connection_id).not.toBe(closedVitals()[0].context.connection_id)
    // the vitals of a connection share its id, and the two connections never merge
    expect(connectionIds(connectingVitals())).toEqual(connectionIds(closedVitals()))
    expect(closedVitals()[0].startClocks.relative).toBeLessThan(closedVitals()[1].startClocks.relative)
  })

  it('flushOpenConnections finalizes still-open connections', () => {
    const tracker = startTracking()
    const socket = notifyConnecting()
    notifyOpen(socket, 10)
    notifyMessageIn(socket, 20, 1)

    tracker.flushOpenConnections()

    expect(closedVitals()).toHaveSize(1)
  })

  it('does not finalize twice when close arrives after flushOpenConnections', () => {
    const tracker = startTracking()
    const socket = notifyConnecting()
    notifyOpen(socket, 10)
    tracker.flushOpenConnections()
    notifyClosed(socket, 20, 1000, 'bye', true)

    expect(closedVitals()).toHaveSize(1)
  })

  it('stop() unsubscribes from the observable and ignores further events', () => {
    const tracker = startTracking()
    const socket = notifyConnecting()
    tracker.stop()
    notifyClosed(socket, 20, 1000, 'bye', true)

    expect(closedVitals()).toHaveSize(0)
  })

  describe('websocket-connecting vital', () => {
    it('emits a duration-0 vital on connecting', () => {
      startTracking()
      notifyConnecting()

      expect(addDurationVitalSpy).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({
          name: WEBSOCKET_CONNECTING_VITAL_NAME,
          type: VitalType.DURATION,
          duration: 0,
        })
      )
    })

    it('uses a fresh UUID as the vital id, distinct from the connection id', () => {
      startTracking()
      const socket = notifyConnecting()
      notifyClosed(socket, 1, 1000, 'bye', true)

      const vital = connectingVitals()[0]
      expect(vital.id).not.toBe(vital.context.connection_id)
      expect(vital.id).toMatch(UUID_PATTERN)
      expect(vital.context.connection_id).toMatch(UUID_PATTERN)
    })

    it('includes the sanitized URL and connection_id, without constructor protocols', () => {
      startTracking()
      const socket = notifyConnecting(0, 'wss://example.com/socket?token=secret&tenant=acme', ['auth-token', 'chat.v1'])
      notifyClosed(socket, 1, 1000, 'bye', true)

      const vital = connectingVitals()[0]
      expect(vital.context).toEqual({
        url: 'wss://example.com/socket',
        connection_id: closedVitals()[0].context.connection_id,
      })
    })

    it('removes query parameters from the URL, including from an encoded path', () => {
      startTracking()
      notifyConnecting(0, 'wss://example.com:8443/path/socket%3Froom?token=secret&tenant=acme')

      expect(connectingVitals()[0].context.url).toBe('wss://example.com:8443/path/socket%3Froom')
    })

    ;(['auth-token', ['auth-token', 'chat.v1']] as Array<string | string[]>).forEach((protocols) => {
      it(`does not include constructor protocols in the vital context when provided as ${typeof protocols === 'string' ? 'a string' : 'an array'}`, () => {
        startTracking()

        notifyConnecting(0, 'wss://example.com/socket', protocols)

        const context = connectingVitals()[0].context
        expect('protocols' in context).toBeFalse()
      })
    })
  })

  describe('websocket-closed vital', () => {
    it('emits a duration-0 vital at close time on a close event', () => {
      const closeAt = 40
      startTracking()
      const socket = notifyConnecting()
      notifyClosed(socket, closeAt, 1000, 'bye', true)

      const closedVital = closedVitals()[0]

      expect(closedVital.type).toBe(VitalType.DURATION)
      expect(closedVital.duration).toBe(0 as Duration)
      expect(closedVital.startClocks).toEqual(relativeToClocks(clock.relative(closeAt)))
      expect(closedVital.context).toEqual({
        url: 'wss://example.com/socket',
        connection_id: connectingVitals()[0].context.connection_id,
      })
    })

    it('emits a duration-0 vital at flush time on a session_end flush', () => {
      const tracker = startTracking()
      const endClocks = relativeToClocks(clock.relative(40))
      notifyConnecting()
      tracker.flushOpenConnections(endClocks)

      const closedVital = closedVitals()[0]

      expect(closedVital.type).toBe(VitalType.DURATION)
      expect(closedVital.duration).toBe(0 as Duration)
      expect(closedVital.startClocks).toEqual(endClocks)
      expect(closedVital.context).toEqual({
        url: 'wss://example.com/socket',
        connection_id: connectingVitals()[0].context.connection_id,
      })
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
        mockViewHistory(),
        addDurationVitalSpy,
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

          expect(connectingVitals()).toHaveSize(collects ? 1 : 0)
          expect(closedVitals()).toHaveSize(collects ? 1 : 0)
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

      function subscribeCollection(addDurationVital: (vital: DurationVital) => void = addDurationVitalSpy) {
        const collection = startWebSocketCollection(
          lifeCycle,
          mockRumConfiguration({ betaTrackWebSockets: true }),
          mockViewHistory(),
          addDurationVital,
          bufferedDataObservable
        )
        registerCleanupTask(() => collection.stop())
      }

      it('reports a connection that also completed before collection subscribed', async () => {
        const socket = notifyConnecting(0)
        notifyOpen(socket, 10)
        notifyMessageIn(socket, 20, 30)
        notifyClosed(socket, 40, 1000, 'bye', true)

        subscribeCollection()
        await collectAsyncCalls(addDurationVitalSpy, 2)

        expect(connectingVitals()).toHaveSize(1)
        expect(closedVitals()).toHaveSize(1)
        // dated from the real close, not from the subscription
        expect(closedVitals()[0].startClocks).toEqual(relativeToClocks(clock.relative(40)))
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
        const replaySpy = jasmine.createSpy<(vital: DurationVital) => void>()

        subscribeCollection((vital) => {
          addDurationVitalSpy(vital)
          if (vitalContext(vital).url === replayedUrl) {
            replaySpy(vital)
          }
        })
        await collectAsyncCalls(replaySpy, 2)

        notifyMessageIn(socket, 50, 5)
        notifyClosed(socket, 60, 1000, 'bye', true)

        expect(connectingVitals()).toHaveSize(2)
        expect(closedVitals()).toHaveSize(2)
        expect(closedVitals()[1].context.connection_id).toBe(connectingVitals()[0].context.connection_id)
      })

      it('keeps a distinct connection id per early connection and emits both vitals', async () => {
        const firstSocket = notifyConnecting(0, 'wss://example.com/socket-a')
        const secondSocket = notifyConnecting(5, 'wss://example.com/socket-b')
        notifyClosed(firstSocket, 10, 1000, 'bye-a', true)
        notifyClosed(secondSocket, 20, 1000, 'bye-b', true)

        subscribeCollection()
        await collectAsyncCalls(addDurationVitalSpy, 4)

        const [firstId, secondId] = connectionIds(connectingVitals())
        expect(firstId).not.toBe(secondId)

        expect(emittedVitals().map((vital) => vital.name)).toEqual([
          WEBSOCKET_CONNECTING_VITAL_NAME,
          WEBSOCKET_CONNECTING_VITAL_NAME,
          WEBSOCKET_CLOSED_VITAL_NAME,
          WEBSOCKET_CLOSED_VITAL_NAME,
        ])
      })
    })

    it('finalizes open connections when the session expires', () => {
      const endClocks = relativeToClocks(clock.relative(40))
      startCollection()
      notifyConnecting()

      expireSession(endClocks)

      expect(closedVitals()).toHaveSize(1)
      expect(closedVitals()[0].startClocks).toEqual(endClocks)
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

      expect(closedVitals()).toHaveSize(1)

      notifyMessageOut(socket, 40, 7)
      notifyClosed(socket, 50, 1000, 'bye', true)

      expect(closedVitals()).toHaveSize(1)
    })
  })
})

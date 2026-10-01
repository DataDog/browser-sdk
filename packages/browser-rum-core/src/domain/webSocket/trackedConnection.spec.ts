import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import type { ClocksState, Duration } from '@datadog/js-core/time'
import { relativeToClocks } from '@datadog/js-core/time'
import type {
  WebSocketClosingContext,
  WebSocketConnectingContext,
  WebSocketMessageInContext,
  WebSocketMessageOutContext,
  WebSocketOpenContext,
} from '../../browser/webSocketObservable'
import { WebSocketTrackingEndReason } from '../../rawRumEvent.types'
import type { MessageDirectionAggregate, TrackedConnection, TrackedConnectionState } from './trackedConnection'
import { createTrackedConnection } from './trackedConnection'

/** Arbitrary relative times at which the connection starts connecting and opens. */
const CONNECTING_AT = 0
const OPEN_AT = 10

const SESSION_END = WebSocketTrackingEndReason.SESSION_END

/** The connection reads nothing from the socket itself, so the contexts carry a stand-in. */
const INSTANCE = {} as WebSocket

describe('trackedConnection', () => {
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
  })

  it('hands out a state to read, which cannot be used to write', () => {
    const connection = createConnectingConnection({ protocols: ['chat.v1'] })
    getStateIn(connection, 'connecting').requestedProtocols!.push('injected')
    expect(getStateIn(connection, 'connecting').requestedProtocols).toEqual(['chat.v1'])

    connection.recordOpen(openContext())
    connection.recordInboundMessage(messageInContext(100, clocksAt(20)))

    const state = getStateIn(connection, 'open')
    state.snapshotVersion = 999
    state.snapshot.inbound.messageCount = 999

    const freshState = getStateIn(connection, 'open')
    expect(freshState.snapshotVersion).toBe(1)
    expect(freshState.snapshot.inbound.messageCount).toBe(1)
  })

  describe('phase', () => {
    it('starts connecting, carrying the identity it was created with', () => {
      const state = getStateIn(
        createConnectingConnection({ url: 'wss://example.com/chat', protocols: ['auth-token', 'chat.v1'] }),
        'connecting'
      )

      expect(state.url).toBe('wss://example.com/chat')
      expect(state.requestedProtocols).toEqual(['auth-token', 'chat.v1'])
      expect(state.connectingClocks).toEqual(clocksAt(CONNECTING_AT))
    })

    it('keeps its id across phases', () => {
      const connection = createConnectingConnection()
      const { id } = connection.getState()

      connection.recordOpen(openContext())
      expect(connection.getState().id).toBe(id)

      connection.recordTrackingEnd(clocksAt(40), SESSION_END)
      expect(connection.getState().id).toBe(id)
    })

    it('turns open on the open event, keeping what the server negotiated', () => {
      const connection = createConnectingConnection()

      connection.recordOpen(
        openContext({ openClocks: clocksAt(OPEN_AT), protocol: 'chat.v1', extensions: 'permessage-deflate' })
      )

      const state = getStateIn(connection, 'open')
      expect(state.openClocks).toEqual(clocksAt(OPEN_AT))
      expect(state.pulseClocks).toEqual(clocksAt(OPEN_AT))
      expect(state.selectedProtocol).toBe('chat.v1')
      expect(state.selectedExtensions).toBe('permessage-deflate')
      expect(state.snapshotVersion).toBe(1)
    })

    it('turns closing when the application closes the socket', () => {
      const connection = createOpenConnection()

      connection.recordClosing(closingContext(clocksAt(30)))

      const state = getStateIn(connection, 'closing')
      expect(state.closingClocks).toEqual(clocksAt(30))
    })

    it('turns closing when the socket is closed during the handshake', () => {
      const connection = createConnectingConnection()

      connection.recordClosing(closingContext(clocksAt(5)))

      const state = getStateIn(connection, 'closing')
      expect(state.closingClocks).toEqual(clocksAt(5))
    })

    it('is open from the open event until the socket closes or tracking ends', () => {
      expect(createConnectingConnection().isOpen()).toBeFalse()
      expect(createOpenConnection().isOpen()).toBeTrue()
      expect(createClosingConnection().isOpen()).toBeFalse()
      expect(createClosedConnection().isOpen()).toBeFalse()
    })

    const PHASES_TRACKING_CAN_END_FROM = [
      { from: 'connecting', createConnection: createConnectingConnection, hasOpened: false },
      { from: 'open', createConnection: createOpenConnection, hasOpened: true },
      { from: 'closing', createConnection: createClosingConnection, hasOpened: true },
      {
        from: 'closing during the handshake',
        createConnection: createClosingDuringHandshakeConnection,
        hasOpened: false,
      },
    ]

    PHASES_TRACKING_CAN_END_FROM.forEach(({ from, createConnection, hasOpened }) => {
      it(`turns closed when tracking ends from ${from}`, () => {
        const connection = createConnection()

        connection.recordTrackingEnd(clocksAt(40), SESSION_END)

        const state = getStateIn(connection, 'closed')
        expect(state.endClocks).toEqual(clocksAt(40))
        expect(state.trackingEndReason).toBe(WebSocketTrackingEndReason.SESSION_END)
      })

      it(`holds a snapshot only if the connection had opened, when tracking ends from ${from}`, () => {
        const connection = createConnection()

        connection.recordTrackingEnd(clocksAt(40), SESSION_END)

        expect(getStateIn(connection, 'closed').snapshot).toEqual(hasOpened ? jasmine.any(Object) : undefined)
      })
    })

    it('keeps the close event when tracking ends on a real close', () => {
      const connection = createOpenConnection()

      connection.recordClose({
        state: 'closed',
        instance: INSTANCE,
        code: 1000,
        reason: 'bye',
        wasClean: true,
        at: clocksAt(40),
      })

      const state = getStateIn(connection, 'closed')
      expect(state.endClocks).toEqual(clocksAt(40))
      expect(state.trackingEndReason).toBe(WebSocketTrackingEndReason.CLOSE_EVENT)
      expect(state.closeEvent).toEqual({ code: 1000, reason: 'bye', wasClean: true })
    })

    it('holds no close event when tracking ends without one', () => {
      const connection = createOpenConnection()

      connection.recordTrackingEnd(clocksAt(40), SESSION_END)

      expect(getStateIn(connection, 'closed').closeEvent).toBeUndefined()
    })
  })

  describe('snapshot version', () => {
    it('starts at 1 on open and increases on every pulse and on tracking end', () => {
      const connection = createConnectingConnection()

      connection.recordOpen(openContext())
      expect(connection.getState()).toEqual(jasmine.objectContaining({ phase: 'open', snapshotVersion: 1 }))

      connection.recordPulse(clocksAt(20))
      expect(connection.getState()).toEqual(jasmine.objectContaining({ phase: 'open', snapshotVersion: 2 }))

      connection.recordPulse(clocksAt(30))
      expect(connection.getState()).toEqual(jasmine.objectContaining({ phase: 'open', snapshotVersion: 3 }))

      connection.recordTrackingEnd(clocksAt(40), SESSION_END)
      expect(connection.getState()).toEqual(jasmine.objectContaining({ phase: 'closed', snapshotVersion: 4 }))
    })

    it('is not consumed by reading the state', () => {
      const connection = createOpenConnection()

      connection.getState()
      connection.getState()

      expect(connection.getState()).toEqual(jasmine.objectContaining({ snapshotVersion: 1 }))
    })

    it('bumps on tracking end even when the connection never opened', () => {
      const connection = createConnectingConnection()

      connection.recordTrackingEnd(clocksAt(40), SESSION_END)

      expect(connection.getState()).toEqual(jasmine.objectContaining({ phase: 'closed', snapshotVersion: 1 }))
    })
  })

  describe('pulse clocks', () => {
    it('dates the open state at the latest pulse, keeping the open date', () => {
      const connection = createOpenConnection()

      connection.recordPulse(clocksAt(50))

      const state = getStateIn(connection, 'open')
      expect(state.pulseClocks).toEqual(clocksAt(50))
      expect(state.openClocks).toEqual(clocksAt(OPEN_AT))
    })

    const PHASES_WITHOUT_A_PULSE = [
      { phase: 'connecting', createConnection: createConnectingConnection },
      { phase: 'closing', createConnection: createClosingConnection },
      { phase: 'closed', createConnection: createClosedConnection },
    ]

    PHASES_WITHOUT_A_PULSE.forEach(({ phase, createConnection }) => {
      it(`ignores a pulse in phase ${phase}, without consuming a snapshot version`, () => {
        const connection = createConnection()
        const stateBefore = connection.getState()

        connection.recordPulse(clocksAt(50))

        expect(connection.getState()).toEqual(stateBefore)
      })
    })
  })

  // Both directions report the same measurements, from arithmetic written once, so both are driven
  // through the same cases.
  const DIRECTIONS = [
    {
      direction: 'inbound' as const,
      recordMessage: (connection: TrackedConnection, size: number, at: ClocksState) =>
        connection.recordInboundMessage(messageInContext(size, at)),
    },
    {
      direction: 'outbound' as const,
      recordMessage: (connection: TrackedConnection, size: number, at: ClocksState) =>
        connection.recordOutboundMessage(messageOutContext(size, 0, at)),
    },
  ]

  DIRECTIONS.forEach(({ direction, recordMessage }) => {
    describe(`${direction} messages`, () => {
      function aggregateOf(connection: TrackedConnection): MessageDirectionAggregate {
        return getStateIn(connection, 'open').snapshot[direction]
      }

      it('counts messages, totals their sizes and keeps the largest one', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 100, clocksAt(20))
        recordMessage(connection, 300, clocksAt(30))
        recordMessage(connection, 200, clocksAt(40))

        const aggregate = aggregateOf(connection)
        expect(aggregate.messageCount).toBe(3)
        expect(aggregate.messageSizeTotal).toBe(600)
        expect(aggregate.messageSizeMax).toBe(300)
      })

      it('is zero-filled while the direction is silent', () => {
        const aggregate = aggregateOf(createOpenConnection())

        expect(aggregate.messageCount).toBe(0)
        expect(aggregate.messageSizeTotal).toBe(0)
        expect(aggregate.messageSizeMax).toBe(0)
        expect(aggregate.longestSilence).toBe(0 as Duration)
      })

      it('reports the longest gap between two messages', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, clocksAt(20))
        recordMessage(connection, 1, clocksAt(50)) // gap of 30
        recordMessage(connection, 1, clocksAt(75)) // gap of 25

        expect(aggregateOf(connection).longestSilence).toBe(30 as Duration)
      })

      it('does not count the interval before the first message as a silence', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, clocksAt(1000))

        expect(aggregateOf(connection).longestSilence).toBe(0 as Duration)
      })
    })
  })

  // The one case the table above cannot express, since it drives a single direction at a time.
  it('keeps the two directions apart', () => {
    const connection = createOpenConnection()

    connection.recordInboundMessage(messageInContext(100, clocksAt(20)))
    connection.recordInboundMessage(messageInContext(100, clocksAt(1020)))
    connection.recordOutboundMessage(messageOutContext(7, 0, clocksAt(520)))

    const { inbound, outbound } = getStateIn(connection, 'open').snapshot
    expect(inbound.messageCount).toBe(2)
    expect(inbound.messageSizeTotal).toBe(200)
    expect(outbound.messageCount).toBe(1)
    expect(outbound.messageSizeTotal).toBe(7)
    // an outbound message closes no inbound gap
    expect(inbound.longestSilence).toBe(1000 as Duration)
    expect(outbound.longestSilence).toBe(0 as Duration)
  })

  describe('outbound send queue', () => {
    it('reports the peak queue depth after the payload is enqueued', () => {
      const connection = createOpenConnection()

      // one large send on a socket that never flushed: the queue did reach a megabyte
      connection.recordOutboundMessage(messageOutContext(1_000_000, 0, clocksAt(20)))

      expect(getStateIn(connection, 'open').snapshot.bufferedAmountMax).toBe(1_000_000)
    })

    it('reports the deepest queue observed across sends', () => {
      const connection = createOpenConnection()

      connection.recordOutboundMessage(messageOutContext(10, 10, clocksAt(20)))
      connection.recordOutboundMessage(messageOutContext(10, 100, clocksAt(30)))
      connection.recordOutboundMessage(messageOutContext(10, 50, clocksAt(40)))

      expect(getStateIn(connection, 'open').snapshot.bufferedAmountMax).toBe(110)
    })
  })

  // ---------------------------------------------------------------------------
  // Dates and the clock
  // ---------------------------------------------------------------------------

  function clocksAt(relative: number): ClocksState {
    return relativeToClocks(clock.relative(relative))
  }

  // ---------------------------------------------------------------------------
  // Building the contexts the observable notifies
  // ---------------------------------------------------------------------------

  function openContext(context: Partial<WebSocketOpenContext> = {}): WebSocketOpenContext {
    return {
      state: 'open',
      instance: INSTANCE,
      openClocks: clocksAt(OPEN_AT),
      protocol: '',
      extensions: '',
      ...context,
    }
  }

  function messageInContext(size: number, at: ClocksState): WebSocketMessageInContext {
    return { state: 'message-in', instance: INSTANCE, size, at }
  }

  function messageOutContext(size: number, bufferedAmountPreSend: number, at: ClocksState): WebSocketMessageOutContext {
    return { state: 'message-out', instance: INSTANCE, size, bufferedAmountPreSend, at }
  }

  function closingContext(at: ClocksState): WebSocketClosingContext {
    return { state: 'closing', instance: INSTANCE, at }
  }

  // ---------------------------------------------------------------------------
  // Building connections
  // ---------------------------------------------------------------------------

  function createConnectingConnection(context: Partial<WebSocketConnectingContext> = {}) {
    return createTrackedConnection({
      state: 'connecting',
      instance: INSTANCE,
      url: 'wss://example.com/socket',
      startClocks: clocksAt(CONNECTING_AT),
      ...context,
    })
  }

  function createOpenConnection() {
    const connection = createConnectingConnection()
    connection.recordOpen(openContext())
    return connection
  }

  function createClosingConnection() {
    const connection = createOpenConnection()
    connection.recordClosing(closingContext(clocksAt(30)))
    return connection
  }

  function createClosingDuringHandshakeConnection() {
    const connection = createConnectingConnection()
    connection.recordClosing(closingContext(clocksAt(5)))
    return connection
  }

  function createClosedConnection() {
    const connection = createOpenConnection()
    connection.recordTrackingEnd(clocksAt(40), SESSION_END)
    return connection
  }

  /** Reads the state, failing the spec unless it is in `phase`, and narrows it to that phase. */
  function getStateIn<Phase extends TrackedConnectionState['phase']>(
    connection: TrackedConnection,
    phase: Phase
  ): Extract<TrackedConnectionState, { phase: Phase }> {
    const state = connection.getState()
    expect(state.phase).toBe(phase)
    return state as Extract<TrackedConnectionState, { phase: Phase }>
  }
})

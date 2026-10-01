import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import type { ClocksState, Duration, RelativeTime } from '@datadog/js-core/time'
import { relativeToClocks } from '@datadog/js-core/time'
import { WebSocketTrackingEndReason } from '../../rawRumEvent.types'
import type {
  MessageDirectionAggregate,
  OutboundAggregate,
  TrackedConnection,
  TrackedConnectionIdentity,
  TrackedConnectionState,
  WebSocketPhase,
} from './trackedConnection'
import { createTrackedConnection } from './trackedConnection'

const CONNECTING_AT = 0
const OPEN_AT = 10

const SESSION_END = { trackingEndReason: WebSocketTrackingEndReason.SESSION_END } as const
const CLOSE_EVENT_END = {
  trackingEndReason: WebSocketTrackingEndReason.CLOSE_EVENT,
  closeEvent: { code: 1000, reason: 'bye', wasClean: true },
} as const

describe('trackedConnection', () => {
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
  })

  it('hands out a state to read, which cannot be used to write', () => {
    const connection = createOpenConnection({ requestedProtocols: ['chat.v1'] })
    connection.recordInboundMessage(100, relativeAt(20))

    const state = getStateIn(connection, 'open')
    state.snapshotVersion = 999
    state.snapshot.inbound.messageCount = 999
    state.requestedProtocols!.push('injected')

    const freshState = getStateIn(connection, 'open')
    expect(freshState.snapshotVersion).toBe(1)
    expect(freshState.snapshot.inbound.messageCount).toBe(1)
    expect(freshState.requestedProtocols).toEqual(['chat.v1'])
  })

  describe('phase', () => {
    it('starts connecting, carrying the identity it was created with', () => {
      const state = createConnectingConnection({
        id: 'some-connection-id',
        url: 'wss://example.com/chat',
        requestedProtocols: ['auth-token', 'chat.v1'],
      }).getState()

      expect(state.phase).toBe('connecting')
      expect(state.id).toBe('some-connection-id')
      expect(state.url).toBe('wss://example.com/chat')
      expect(state.requestedProtocols).toEqual(['auth-token', 'chat.v1'])
      expect(state.connectingClocks).toEqual(clocksAt(CONNECTING_AT))
    })

    it('turns open on the open event, keeping what the server negotiated', () => {
      const connection = createConnectingConnection()

      connection.recordOpen({
        openClocks: clocksAt(OPEN_AT),
        selectedProtocol: 'chat.v1',
        selectedExtensions: 'permessage-deflate',
      })

      const state = getStateIn(connection, 'open')
      expect(state.openClocks).toEqual(clocksAt(OPEN_AT))
      expect(state.selectedProtocol).toBe('chat.v1')
      expect(state.selectedExtensions).toBe('permessage-deflate')
      expect(state.snapshotVersion).toBe(1)
    })

    it('turns closing when the application closes the socket', () => {
      const connection = createOpenConnection()

      connection.recordClosing(clocksAt(30))

      const state = getStateIn(connection, 'closing')
      expect(state.closingClocks).toEqual(clocksAt(30))
      expect(state.openClocks).toEqual(clocksAt(OPEN_AT))
    })

    it('turns closing without an open date when the socket is closed during the handshake', () => {
      const connection = createConnectingConnection()

      connection.recordClosing(clocksAt(5))

      const state = getStateIn(connection, 'closing')
      expect(state.closingClocks).toEqual(clocksAt(5))
      expect(state.openClocks).toBeUndefined()
    })

    it('reports the same phase alone as in the full state', () => {
      const connection = createConnectingConnection()
      expect(connection.getPhase()).toBe('connecting')

      connection.recordOpen({ openClocks: clocksAt(OPEN_AT) })
      expect(connection.getPhase()).toBe('open')

      connection.recordClosing(clocksAt(30))
      expect(connection.getPhase()).toBe('closing')

      connection.recordTrackingEnd(clocksAt(40), SESSION_END)
      expect(connection.getPhase()).toBe('closed')
    })

    const PHASES_TRACKING_CAN_END_FROM = [
      { from: 'connecting', createConnection: createConnectingConnection },
      { from: 'open', createConnection: createOpenConnection },
      { from: 'closing', createConnection: createClosingConnection },
    ]

    PHASES_TRACKING_CAN_END_FROM.forEach(({ from, createConnection }) => {
      it(`turns closed when tracking ends from ${from}`, () => {
        const connection = createConnection()

        connection.recordTrackingEnd(clocksAt(40), SESSION_END)

        const state = getStateIn(connection, 'closed')
        expect(state.endClocks).toEqual(clocksAt(40))
        expect(state.trackingEndReason).toBe(WebSocketTrackingEndReason.SESSION_END)
      })
    })

    it('keeps the closing date when tracking ends after the application closed the socket', () => {
      const connection = createClosingConnection()

      connection.recordTrackingEnd(clocksAt(40), SESSION_END)

      const state = getStateIn(connection, 'closed')
      expect(state.closingClocks).toEqual(clocksAt(30))
    })

    it('keeps the close event when tracking ends on a real close', () => {
      const connection = createOpenConnection()

      connection.recordTrackingEnd(clocksAt(40), CLOSE_EVENT_END)

      const state = getStateIn(connection, 'closed')
      expect(state.trackingEndReason).toBe(WebSocketTrackingEndReason.CLOSE_EVENT)
      expect(state.closeEvent).toEqual(CLOSE_EVENT_END.closeEvent)
    })
  })

  describe('snapshot version', () => {
    it('starts at 1 on open and increases on tracking end', () => {
      const connection = createConnectingConnection()

      connection.recordOpen({ openClocks: clocksAt(OPEN_AT) })
      expect(connection.getState()).toEqual(jasmine.objectContaining({ phase: 'open', snapshotVersion: 1 }))

      connection.recordTrackingEnd(clocksAt(40), SESSION_END)
      expect(connection.getState()).toEqual(jasmine.objectContaining({ phase: 'closed', snapshotVersion: 2 }))
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

  // Both directions report the same measurements, from arithmetic written once, so both are driven
  // through the same cases.
  const DIRECTIONS = [
    {
      direction: 'inbound' as const,
      recordMessage: (connection: TrackedConnection, size: number, at: RelativeTime) =>
        connection.recordInboundMessage(size, at),
    },
    {
      direction: 'outbound' as const,
      recordMessage: (connection: TrackedConnection, size: number, at: RelativeTime) =>
        connection.recordOutboundMessage(size, 0, at),
    },
  ]

  DIRECTIONS.forEach(({ direction, recordMessage }) => {
    describe(`${direction} messages`, () => {
      function aggregateOf(connection: TrackedConnection): MessageDirectionAggregate {
        return connection.getState().snapshot[direction]
      }

      it('counts messages, totals their sizes and keeps the largest one', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 100, relativeAt(20))
        recordMessage(connection, 300, relativeAt(30))
        recordMessage(connection, 200, relativeAt(40))

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

        recordMessage(connection, 1, relativeAt(20))
        recordMessage(connection, 1, relativeAt(50)) // gap of 30
        recordMessage(connection, 1, relativeAt(75)) // gap of 25

        expect(aggregateOf(connection).longestSilence).toBe(30 as Duration)
      })

      it('does not count the interval before the first message as a silence', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, relativeAt(1000))

        expect(aggregateOf(connection).longestSilence).toBe(0 as Duration)
      })
    })
  })

  // The one case the table above cannot express, since it drives a single direction at a time.
  it('keeps the two directions apart', () => {
    const connection = createOpenConnection()

    connection.recordInboundMessage(100, relativeAt(20))
    connection.recordInboundMessage(100, relativeAt(1020))
    connection.recordOutboundMessage(7, 0, relativeAt(520))

    const { inbound, outbound } = connection.getState().snapshot
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
      connection.recordOutboundMessage(1_000_000, 0, relativeAt(20))

      expect(outboundOf(connection).bufferedAmountMax).toBe(1_000_000)
    })

    it('reports the deepest queue observed across sends', () => {
      const connection = createOpenConnection()

      connection.recordOutboundMessage(10, 10, relativeAt(20))
      connection.recordOutboundMessage(10, 100, relativeAt(30))
      connection.recordOutboundMessage(10, 50, relativeAt(40))

      expect(outboundOf(connection).bufferedAmountMax).toBe(110)
    })
  })

  // ---------------------------------------------------------------------------
  // Dates and the clock
  // ---------------------------------------------------------------------------

  function clocksAt(relative: number): ClocksState {
    return relativeToClocks(clock.relative(relative))
  }

  function relativeAt(relative: number): RelativeTime {
    return clock.relative(relative)
  }

  // ---------------------------------------------------------------------------
  // Building connections
  // ---------------------------------------------------------------------------

  function createConnectingConnection(identity: Partial<TrackedConnectionIdentity> = {}) {
    return createTrackedConnection({
      id: 'connection-id',
      url: 'wss://example.com/socket',
      connectingClocks: clocksAt(CONNECTING_AT),
      ...identity,
    })
  }

  function createOpenConnection(identity: Partial<TrackedConnectionIdentity> = {}) {
    const connection = createConnectingConnection(identity)
    connection.recordOpen({ openClocks: clocksAt(OPEN_AT) })
    return connection
  }

  function createClosingConnection() {
    const connection = createOpenConnection()
    connection.recordClosing(clocksAt(30))
    return connection
  }

  /** Reads the state, failing the spec unless it is in `phase`, and narrows it to that phase. */
  function getStateIn<Phase extends WebSocketPhase>(
    connection: TrackedConnection,
    phase: Phase
  ): Extract<TrackedConnectionState, { phase: Phase }> {
    const state = connection.getState()
    expect(state.phase).toBe(phase)
    return state as Extract<TrackedConnectionState, { phase: Phase }>
  }

  function outboundOf(connection: TrackedConnection): OutboundAggregate {
    return connection.getState().snapshot.outbound
  }
})

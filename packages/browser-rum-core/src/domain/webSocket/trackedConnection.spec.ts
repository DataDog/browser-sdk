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
      expect(state.pulseClocks).toEqual(clocksAt(OPEN_AT))
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

      connection.recordTrackingEnd(clocksAt(40), 0, SESSION_END)
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

        connection.recordTrackingEnd(clocksAt(40), 0, SESSION_END)

        const state = getStateIn(connection, 'closed')
        expect(state.endClocks).toEqual(clocksAt(40))
        expect(state.trackingEndReason).toBe(WebSocketTrackingEndReason.SESSION_END)
      })
    })

    it('keeps the closing date when tracking ends after the application closed the socket', () => {
      const connection = createClosingConnection()

      connection.recordTrackingEnd(clocksAt(40), 0, SESSION_END)

      const state = getStateIn(connection, 'closed')
      expect(state.closingClocks).toEqual(clocksAt(30))
    })

    it('keeps the close event when tracking ends on a real close', () => {
      const connection = createOpenConnection()

      connection.recordTrackingEnd(clocksAt(40), 0, CLOSE_EVENT_END)

      const state = getStateIn(connection, 'closed')
      expect(state.trackingEndReason).toBe(WebSocketTrackingEndReason.CLOSE_EVENT)
      expect(state.closeEvent).toEqual(CLOSE_EVENT_END.closeEvent)
    })
  })

  describe('snapshot version', () => {
    it('starts at 1 on open and increases on every pulse and on tracking end', () => {
      const connection = createConnectingConnection()

      connection.recordOpen({ openClocks: clocksAt(OPEN_AT) })
      expect(connection.getState()).toEqual(jasmine.objectContaining({ phase: 'open', snapshotVersion: 1 }))

      connection.recordPulse(clocksAt(20))
      expect(connection.getState()).toEqual(jasmine.objectContaining({ phase: 'open', snapshotVersion: 2 }))

      connection.recordPulse(clocksAt(30))
      expect(connection.getState()).toEqual(jasmine.objectContaining({ phase: 'open', snapshotVersion: 3 }))

      connection.recordTrackingEnd(clocksAt(40), 0, SESSION_END)
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

      connection.recordTrackingEnd(clocksAt(40), 0, SESSION_END)

      expect(connection.getState()).toEqual(jasmine.objectContaining({ phase: 'closed', snapshotVersion: 1 }))
    })
  })

  describe('pulse clocks', () => {
    it('freezes the open snapshot at the pulse, however late the clock has moved', () => {
      const connection = createOpenConnection()

      connection.recordInboundMessage(1, relativeAt(20))
      connection.recordPulse(clocksAt(50))

      moveClockTo(10_000)
      expect(connection.getState().snapshot.inbound.longestSilence).toBe(30 as Duration)
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

      function aggregateAt(connection: TrackedConnection, relative: number): MessageDirectionAggregate {
        connection.recordPulse(clocksAt(relative))
        return aggregateOf(connection)
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
        expect(aggregate.timeToFirstMessage).toBeUndefined()
      })

      it('measures the time to the first message from the open date, and keeps it', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, relativeAt(OPEN_AT + 3))
        recordMessage(connection, 1, relativeAt(25))

        expect(aggregateOf(connection).timeToFirstMessage).toBe(3 as Duration)
      })

      it('reports the longest gap between two messages', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, relativeAt(20))
        recordMessage(connection, 1, relativeAt(50)) // gap of 30
        recordMessage(connection, 1, relativeAt(75)) // gap of 25

        expect(aggregateAt(connection, 75).longestSilence).toBe(30 as Duration)
      })

      it('includes the gap still open at the pulse', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, relativeAt(1000))
        recordMessage(connection, 1, relativeAt(4000)) // gap of 3s, the longest completed one

        expect(aggregateAt(connection, 60_000).longestSilence).toBe(56_000 as Duration)
        expect(aggregateAt(connection, 300_000).longestSilence).toBe(296_000 as Duration)
      })

      // The interval before the *first* message is excluded — that is the time to first message —
      // but the interval since it is a silence like any other, and reporting 0 for it would
      // contradict the silence before close of the very same payload.
      it('reports the gap since a single message, before any gap has completed', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, relativeAt(1000))

        expect(aggregateAt(connection, 1500).longestSilence).toBe(500 as Duration)
      })

      it('never shrinks across repeated reads', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, relativeAt(1000))
        const silenceWhileQuiet = aggregateAt(connection, 60_000).longestSilence

        // the message closes that gap at 59.1s and opens a fresh one: the gap it completed is kept
        recordMessage(connection, 1, relativeAt(60_100))
        const silenceAfterMessage = aggregateAt(connection, 60_200).longestSilence

        expect(silenceWhileQuiet).toBe(59_000 as Duration)
        expect(silenceAfterMessage).toBe(59_100 as Duration)
      })

      it('measures the silence before close from the tracking end date, once closed', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, relativeAt(20))
        connection.recordTrackingEnd(clocksAt(50), 0, SESSION_END)

        expect(aggregateOf(connection).silenceBeforeClose).toBe(30 as Duration)
      })

      it('freezes the silences at the tracking end date, however late the state is read', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, relativeAt(20))
        connection.recordTrackingEnd(clocksAt(50), 0, SESSION_END)

        moveClockTo(10_000)
        const aggregate = aggregateOf(connection)
        expect(aggregate.silenceBeforeClose).toBe(30 as Duration)
        expect(aggregate.longestSilence).toBe(30 as Duration)
      })

      it('keeps the tracking end date over a later pulse once closed', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, relativeAt(20))
        connection.recordTrackingEnd(clocksAt(50), 0, SESSION_END)

        moveClockTo(10_000)
        const aggregate = aggregateOf(connection)
        expect(aggregate.silenceBeforeClose).toBe(30 as Duration)
        expect(aggregate.longestSilence).toBe(30 as Duration)
      })

      it('has no silence before close while tracking continues', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, relativeAt(20))

        expect(aggregateAt(connection, 50).silenceBeforeClose).toBeUndefined()
      })

      it('has no silence before close when the direction was silent', () => {
        const connection = createOpenConnection()

        connection.recordTrackingEnd(clocksAt(50), 0, SESSION_END)

        expect(aggregateOf(connection).silenceBeforeClose).toBeUndefined()
      })
    })
  })

  // The one case the table above cannot express, since it drives a single direction at a time.
  it('keeps the two directions apart', () => {
    const connection = createOpenConnection()

    connection.recordInboundMessage(100, relativeAt(20))
    connection.recordOutboundMessage(7, 0, relativeAt(1020))

    connection.recordPulse(clocksAt(1020))
    const { inbound, outbound } = connection.getState().snapshot
    expect(inbound.messageCount).toBe(1)
    expect(inbound.messageSizeTotal).toBe(100)
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

    it('reports the queue depth handed in at tracking end', () => {
      const connection = createOpenConnection()

      connection.recordTrackingEnd(clocksAt(50), 100, SESSION_END)

      expect(outboundOf(connection).bufferedAmountAtClose).toBe(100)
    })

    it('has no queue depth at close while tracking continues', () => {
      expect(outboundOf(createOpenConnection()).bufferedAmountAtClose).toBeUndefined()
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

  /**
   * Moves the clock, whose monotonic reading is what closes the silence still in progress when the
   * state is read during connecting/closing. Open reads freeze at the pulse instead.
   */
  function moveClockTo(relative: number) {
    clock.setDate(new Date(clock.timeStamp(relative)))
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

  function createClosedConnection() {
    const connection = createOpenConnection()
    connection.recordTrackingEnd(clocksAt(40), 0, SESSION_END)
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

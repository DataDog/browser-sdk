import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import type { ClocksState, Duration, TimeStamp } from '@datadog/js-core/time'
import { relativeToClocks } from '@datadog/js-core/time'
import type {
  MessageDirectionAggregate,
  OutboundAggregate,
  TrackedConnection,
  TrackedConnectionIdentity,
} from './trackedConnection'
import { createTrackedConnection, WEBSOCKET_BACKPRESSURE_THRESHOLD_BYTES } from './trackedConnection'

const CONNECTING_AT = 0
const OPEN_AT = 10

describe('trackedConnection', () => {
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
  })

  it('hands out a state to read, which cannot be used to write', () => {
    const connection = createOpenConnection({ requestedProtocols: ['chat.v1'] })
    connection.recordInboundMessage(100, timeStampAt(20))

    const state = connection.getState()
    state.phase = 'closed'
    state.snapshot.inbound.messageCount = 999
    state.requestedProtocols!.push('injected')

    const freshState = connection.getState()
    expect(freshState.phase).toBe('open')
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

      const state = connection.getState()
      expect(state.phase).toBe('open')
      expect(state.openClocks).toEqual(clocksAt(OPEN_AT))
      expect(state.selectedProtocol).toBe('chat.v1')
      expect(state.selectedExtensions).toBe('permessage-deflate')
    })

    it('turns closing when the application closes the socket', () => {
      const connection = createOpenConnection()

      connection.recordClosing(clocksAt(30))

      const state = connection.getState()
      expect(state.phase).toBe('closing')
      expect(state.closingClocks).toEqual(clocksAt(30))
      expect(state.endClocks).toBeUndefined()
    })

    const PHASES_TRACKING_CAN_END_FROM = [
      { from: 'connecting', createConnection: createConnectingConnection },
      { from: 'open', createConnection: createOpenConnection },
      { from: 'closing', createConnection: createClosingConnection },
    ]

    PHASES_TRACKING_CAN_END_FROM.forEach(({ from, createConnection }) => {
      it(`turns closed when tracking ends from ${from}`, () => {
        const connection = createConnection()

        connection.recordTrackingEnd(clocksAt(40), 0)

        const state = connection.getState()
        expect(state.phase).toBe('closed')
        expect(state.endClocks).toEqual(clocksAt(40))
      })
    })

    it('keeps the closing date when tracking ends after the application closed the socket', () => {
      const connection = createClosingConnection()

      connection.recordTrackingEnd(clocksAt(40), 0)

      expect(connection.getState().closingClocks).toEqual(clocksAt(30))
    })
  })

  describe('snapshot version', () => {
    it('starts at 1 and increases on every pull', () => {
      const connection = createConnectingConnection()

      expect(connection.nextSnapshotVersion()).toBe(1)
      expect(connection.nextSnapshotVersion()).toBe(2)
      expect(connection.nextSnapshotVersion()).toBe(3)
    })

    it('is not consumed by reading the state', () => {
      const connection = createConnectingConnection()

      connection.getState()
      connection.getState()

      expect(connection.nextSnapshotVersion()).toBe(1)
    })
  })

  // Both directions report the same measurements, from arithmetic written once, so both are driven
  // through the same cases.
  const DIRECTIONS = [
    {
      direction: 'inbound' as const,
      recordMessage: (connection: TrackedConnection, size: number, at: TimeStamp) =>
        connection.recordInboundMessage(size, at),
    },
    {
      direction: 'outbound' as const,
      recordMessage: (connection: TrackedConnection, size: number, at: TimeStamp) =>
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

        recordMessage(connection, 100, timeStampAt(20))
        recordMessage(connection, 300, timeStampAt(30))
        recordMessage(connection, 200, timeStampAt(40))

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

        recordMessage(connection, 1, timeStampAt(OPEN_AT + 3))
        recordMessage(connection, 1, timeStampAt(25))

        expect(aggregateOf(connection).timeToFirstMessage).toBe(3 as Duration)
      })

      it('reports the longest gap between two messages', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, timeStampAt(20))
        recordMessage(connection, 1, timeStampAt(50)) // gap of 30
        recordMessage(connection, 1, timeStampAt(75)) // gap of 25

        moveClockTo(75)
        expect(aggregateOf(connection).longestSilence).toBe(30 as Duration)
      })

      it('includes the gap still open at read time', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, timeStampAt(1000))
        recordMessage(connection, 1, timeStampAt(4000)) // gap of 3s, the longest completed one

        moveClockTo(60_000) // gap of 56s since the last message, still open
        expect(aggregateOf(connection).longestSilence).toBe(56_000 as Duration)
        moveClockTo(300_000) // gap of 296s since the last message, still open
        expect(aggregateOf(connection).longestSilence).toBe(296_000 as Duration)
      })

      // The interval before the *first* message is excluded — that is the time to first message —
      // but the interval since it is a silence like any other, and reporting 0 for it would
      // contradict the silence before close of the very same payload.
      it('reports the gap since a single message, before any gap has completed', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, timeStampAt(1000))

        moveClockTo(1500)
        expect(aggregateOf(connection).longestSilence).toBe(500 as Duration)
      })

      it('never shrinks across repeated reads', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, timeStampAt(1000))
        moveClockTo(60_000) // gap of 59s since the message, still open
        const silenceWhileQuiet = aggregateOf(connection).longestSilence

        // the message closes that gap at 59.1s and opens a fresh one: the gap it completed is kept
        recordMessage(connection, 1, timeStampAt(60_100))
        moveClockTo(60_200)
        const silenceAfterMessage = aggregateOf(connection).longestSilence

        expect(silenceWhileQuiet).toBe(59_000 as Duration)
        expect(silenceAfterMessage).toBe(59_100 as Duration)
      })

      it('measures the silence before close from the tracking end date, once closed', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, timeStampAt(20))
        connection.recordTrackingEnd(clocksAt(50), 0)

        moveClockTo(50)
        expect(aggregateOf(connection).silenceBeforeClose).toBe(30 as Duration)
      })

      it('freezes the silences at the tracking end date, however late the state is read', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, timeStampAt(20))
        connection.recordTrackingEnd(clocksAt(50), 0)

        moveClockTo(10_000)
        const aggregate = aggregateOf(connection)
        expect(aggregate.silenceBeforeClose).toBe(30 as Duration)
        expect(aggregate.longestSilence).toBe(30 as Duration)
      })

      it('has no silence before close while tracking continues', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, timeStampAt(20))

        moveClockTo(50)
        expect(aggregateOf(connection).silenceBeforeClose).toBeUndefined()
      })

      it('has no silence before close when the direction was silent', () => {
        const connection = createOpenConnection()

        connection.recordTrackingEnd(clocksAt(50), 0)

        expect(aggregateOf(connection).silenceBeforeClose).toBeUndefined()
      })
    })
  })

  // The one case the table above cannot express, since it drives a single direction at a time.
  it('keeps the two directions apart', () => {
    const connection = createOpenConnection()

    connection.recordInboundMessage(100, timeStampAt(20))
    connection.recordOutboundMessage(7, 0, timeStampAt(1020))

    moveClockTo(1020)
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
    it('counts a send as backpressured only from the threshold up', () => {
      const connection = createOpenConnection()

      connection.recordOutboundMessage(1, WEBSOCKET_BACKPRESSURE_THRESHOLD_BYTES - 1, timeStampAt(20))
      expect(outboundOf(connection).backpressuredMessageCount).toBe(0)

      connection.recordOutboundMessage(1, WEBSOCKET_BACKPRESSURE_THRESHOLD_BYTES, timeStampAt(30))
      expect(outboundOf(connection).backpressuredMessageCount).toBe(1)

      connection.recordOutboundMessage(1, WEBSOCKET_BACKPRESSURE_THRESHOLD_BYTES * 2, timeStampAt(40))
      expect(outboundOf(connection).backpressuredMessageCount).toBe(2)
    })

    it('reports the peak queue depth after the payload is enqueued', () => {
      const connection = createOpenConnection()

      // one large send on a socket that never flushed: the queue did reach a megabyte
      connection.recordOutboundMessage(1_000_000, 0, timeStampAt(20))

      expect(outboundOf(connection).bufferedAmountMax).toBe(1_000_000)
    })

    it('reports the deepest queue observed across sends', () => {
      const connection = createOpenConnection()

      connection.recordOutboundMessage(10, 10, timeStampAt(20))
      connection.recordOutboundMessage(10, 100, timeStampAt(30))
      connection.recordOutboundMessage(10, 50, timeStampAt(40))

      expect(outboundOf(connection).bufferedAmountMax).toBe(110)
    })

    it('reports the queue depth handed in at tracking end', () => {
      const connection = createOpenConnection()

      connection.recordTrackingEnd(clocksAt(50), 100)

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

  function timeStampAt(relative: number): TimeStamp {
    return clock.timeStamp(relative)
  }

  /**
   * Moves the wall clock, which is what closes the silence still in progress when the state is
   * read. Reads taken without moving it happen at `CONNECTING_AT`.
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

  function outboundOf(connection: TrackedConnection): OutboundAggregate {
    return connection.getState().snapshot.outbound
  }
})

import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import type { ClocksState, Duration, TimeStamp } from '@datadog/js-core/time'
import { relativeToClocks } from '@datadog/js-core/time'
import type { MessageDirectionAggregate, TrackedConnection, TrackedConnectionIdentity } from './trackedConnection'
import { createTrackedConnection, WEBSOCKET_BACKPRESSURE_THRESHOLD_BYTES } from './trackedConnection'

const CONNECTING_AT = 0
const OPEN_AT = 10

describe('trackedConnection', () => {
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
  })

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

  function createConnection(identity: Partial<TrackedConnectionIdentity> = {}) {
    return createTrackedConnection({
      id: 'connection-id',
      url: 'wss://example.com/socket',
      connectingClocks: clocksAt(CONNECTING_AT),
      ...identity,
    })
  }

  function createOpenConnection() {
    const connection = createConnection()
    connection.recordOpen({ openClocks: clocksAt(OPEN_AT) })
    return connection
  }

  describe('phase', () => {
    it('starts connecting, carrying the identity it was created with', () => {
      const state = createConnection({
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
      const connection = createConnection()

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

    it('has no negotiated protocol nor extensions when the server selected none', () => {
      const state = createOpenConnection().getState()

      expect(state.selectedProtocol).toBeUndefined()
      expect(state.selectedExtensions).toBeUndefined()
    })

    it('turns closing when the application closes the socket', () => {
      const connection = createOpenConnection()

      connection.recordClosing(clocksAt(30))

      const state = connection.getState()
      expect(state.phase).toBe('closing')
      expect(state.closingClocks).toEqual(clocksAt(30))
      expect(state.endClocks).toBeUndefined()
    })

    it('turns closed when tracking ends, whatever the phase it ended from', () => {
      const closedFromOpen = createOpenConnection()
      closedFromOpen.recordTrackingEnd(clocksAt(40), 0)
      expect(closedFromOpen.getState().phase).toBe('closed')
      expect(closedFromOpen.getState().endClocks).toEqual(clocksAt(40))

      // a handshake that never succeeded: no open phase was ever entered
      const closedFromConnecting = createConnection()
      closedFromConnecting.recordTrackingEnd(clocksAt(40), 0)
      expect(closedFromConnecting.getState().phase).toBe('closed')
      expect(closedFromConnecting.getState().openClocks).toBeUndefined()

      const closedFromClosing = createOpenConnection()
      closedFromClosing.recordClosing(clocksAt(30))
      closedFromClosing.recordTrackingEnd(clocksAt(40), 0)
      expect(closedFromClosing.getState().phase).toBe('closed')
      expect(closedFromClosing.getState().closingClocks).toEqual(clocksAt(30))
    })
  })

  describe('snapshot version', () => {
    it('starts at 1 and increases on every pull', () => {
      const connection = createConnection()

      expect(connection.nextSnapshotVersion()).toBe(1)
      expect(connection.nextSnapshotVersion()).toBe(2)
      expect(connection.nextSnapshotVersion()).toBe(3)
    })

    it('is not consumed by reading the state', () => {
      const connection = createConnection()

      connection.getState()
      connection.getState()

      expect(connection.nextSnapshotVersion()).toBe(1)
    })

    it('is private: the state carries no version to set or reset', () => {
      expect('snapshotVersion' in createConnection().getState()).toBeFalse()
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

        recordMessage(connection, 1, timeStampAt(13))
        recordMessage(connection, 1, timeStampAt(25))

        expect(aggregateOf(connection).timeToFirstMessage).toBe(3 as Duration)
      })

      it('has no time to the first message when the handshake never succeeded', () => {
        const connection = createConnection()

        recordMessage(connection, 1, timeStampAt(13))

        const aggregate = aggregateOf(connection)
        expect(aggregate.timeToFirstMessage).toBeUndefined()
        expect(aggregate.messageCount).toBe(1)
      })

      it('reports the longest gap between two messages', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, timeStampAt(20))
        recordMessage(connection, 1, timeStampAt(50)) // gap of 30
        recordMessage(connection, 1, timeStampAt(75)) // gap of 25

        moveClockTo(75)
        expect(aggregateOf(connection).longestSilence).toBe(30 as Duration)
      })

      it('includes the gap still open at read time, so a quiet socket reports its quiet', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, timeStampAt(1000))
        recordMessage(connection, 1, timeStampAt(4000)) // gap of 3s, the longest completed one

        moveClockTo(60_000)
        expect(aggregateOf(connection).longestSilence).toBe(56_000 as Duration)
        moveClockTo(300_000)
        expect(aggregateOf(connection).longestSilence).toBe(296_000 as Duration)
      })

      // The interval before the *first* message is excluded — that is the time to first message —
      // but the interval since it is a silence like any other, and reporting 0 for it would
      // contradict the silence before close of the very same payload.
      it('reports the gap since a single message, before any gap has completed', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, timeStampAt(1000))

        moveClockTo(60_000)
        expect(aggregateOf(connection).longestSilence).toBe(59_000 as Duration)
      })

      it('never shrinks across repeated reads', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, timeStampAt(1000))
        moveClockTo(60_000)
        const silenceWhileQuiet = aggregateOf(connection).longestSilence

        // the message closes that gap at 59.1s and opens a fresh one: the gap it completed is kept
        recordMessage(connection, 1, timeStampAt(60_100))
        moveClockTo(60_200)
        const silenceAfterMessage = aggregateOf(connection).longestSilence

        expect(silenceWhileQuiet).toBe(59_000 as Duration)
        expect(silenceAfterMessage).toBe(59_100 as Duration)
        expect(silenceAfterMessage).toBeGreaterThanOrEqual(silenceWhileQuiet)
      })

      it('measures the silence before close from the tracking end date, once closed', () => {
        const connection = createOpenConnection()

        recordMessage(connection, 1, timeStampAt(20))
        connection.recordTrackingEnd(clocksAt(50), 0)

        moveClockTo(120)
        const aggregate = aggregateOf(connection)
        expect(aggregate.silenceBeforeClose).toBe(30 as Duration)
        // the silences freeze at tracking end: a later read reports the same values
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

  it('hands out a state to read, which cannot be used to write', () => {
    const connection = createConnection({ requestedProtocols: ['chat.v1'] })
    connection.recordOpen({ openClocks: clocksAt(OPEN_AT) })
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
      expect(connection.getState().snapshot.outbound.backpressuredMessageCount).toBe(0)

      connection.recordOutboundMessage(1, WEBSOCKET_BACKPRESSURE_THRESHOLD_BYTES, timeStampAt(30))
      expect(connection.getState().snapshot.outbound.backpressuredMessageCount).toBe(1)

      connection.recordOutboundMessage(1, WEBSOCKET_BACKPRESSURE_THRESHOLD_BYTES * 2, timeStampAt(40))
      expect(connection.getState().snapshot.outbound.backpressuredMessageCount).toBe(2)
    })

    it('reports the peak queue depth after the payload is enqueued', () => {
      const connection = createOpenConnection()

      // one large send on a socket that never flushed: the queue did reach a megabyte
      connection.recordOutboundMessage(1_000_000, 0, timeStampAt(20))

      expect(connection.getState().snapshot.outbound.bufferedAmountMax).toBe(1_000_000)
    })

    it('reports the deepest queue observed across sends', () => {
      const connection = createOpenConnection()

      connection.recordOutboundMessage(10, 10, timeStampAt(20))
      connection.recordOutboundMessage(10, 100, timeStampAt(30))
      connection.recordOutboundMessage(10, 50, timeStampAt(40))

      expect(connection.getState().snapshot.outbound.bufferedAmountMax).toBe(110)
    })

    it('reports the queue depth handed in at tracking end, which never exceeds the peak', () => {
      const connection = createOpenConnection()

      connection.recordOutboundMessage(100, 0, timeStampAt(20))
      connection.recordTrackingEnd(clocksAt(50), 100)

      const { outbound } = connection.getState().snapshot
      expect(outbound.bufferedAmountAtClose).toBe(100)
      expect(outbound.bufferedAmountMax).toBeGreaterThanOrEqual(outbound.bufferedAmountAtClose!)
    })

    it('has no queue depth at close while tracking continues', () => {
      const connection = createOpenConnection()

      connection.recordOutboundMessage(100, 0, timeStampAt(20))

      expect(connection.getState().snapshot.outbound.bufferedAmountAtClose).toBeUndefined()
    })
  })
})

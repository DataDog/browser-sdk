import type { ClocksState, Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/js-core/time'
import type {
  RawRumEvent,
  RawRumWebSocketClosedVitalProperties,
  RawRumWebSocketClosingVitalProperties,
  RawRumWebSocketConnectingVitalProperties,
  RawRumWebSocketOpenVitalProperties,
} from '../../rawRumEvent.types'
import { RumEventType, VitalType, WebSocketTrackingEndReason, WebSocketVitalName } from '../../rawRumEvent.types'
import type { MessageDirectionAggregate, OutboundAggregate, TrackedConnectionState } from './trackedConnection'
import { serializeWebSocketVital } from './serializeWebSocketVital'

/** Every date in this spec is an offset from it, so the expected values stay readable. */
const CONNECTING_TIMESTAMP = 1_700_000_000_000

const CLOSE_EVENT = { code: 1000, reason: 'bye', wasClean: true }

describe('serializeWebSocketVital', () => {
  function clocksAt(offset: number): ClocksState {
    return { relative: offset as RelativeTime, timeStamp: (CONNECTING_TIMESTAMP + offset) as TimeStamp }
  }

  function timeStampAt(offset: number) {
    return (CONNECTING_TIMESTAMP + offset) as TimeStamp
  }

  /** What a duration held in milliseconds is reported as. */
  function nanoseconds(milliseconds: number) {
    return (milliseconds * 1e6) as ServerDuration
  }

  function connectingState(state: Partial<TrackedConnectionState> = {}): TrackedConnectionState {
    return {
      phase: 'connecting',
      id: 'connection-id',
      url: 'wss://example.com/socket',
      connectingClocks: clocksAt(0),
      snapshot: { inbound: silentDirection(), outbound: { ...silentDirection(), ...silentOutbound() } },
      ...state,
    }
  }

  function openState(state: Partial<TrackedConnectionState> = {}): TrackedConnectionState {
    return connectingState({ phase: 'open', openClocks: clocksAt(10), ...state })
  }

  function closingState(state: Partial<TrackedConnectionState> = {}): TrackedConnectionState {
    return openState({ phase: 'closing', closingClocks: clocksAt(30), ...state })
  }

  function closedState(state: Partial<TrackedConnectionState> = {}): TrackedConnectionState {
    return openState({ phase: 'closed', endClocks: clocksAt(50), ...state })
  }

  /** A connection whose handshake never succeeded, and which therefore holds no open clocks. */
  function neverOpenedClosedState(state: Partial<TrackedConnectionState> = {}): TrackedConnectionState {
    return connectingState({ phase: 'closed', endClocks: clocksAt(50), ...state })
  }

  function silentDirection(direction: Partial<MessageDirectionAggregate> = {}): MessageDirectionAggregate {
    return { messageCount: 0, messageSizeTotal: 0, messageSizeMax: 0, longestSilence: 0 as Duration, ...direction }
  }

  function silentOutbound(outbound: Partial<OutboundAggregate> = {}) {
    return { bufferedAmountMax: 0, backpressuredMessageCount: 0, ...outbound }
  }

  function serializeConnecting(state = connectingState()) {
    const event = serializeWebSocketVital(state, { phase: 'connecting' })
    return { event, websocket: event.vital.websocket as ConnectingProperties }
  }

  function serializeOpen(state = openState(), phaseInfo: { snapshotVersion?: number; beatOffset?: number } = {}) {
    const event = serializeWebSocketVital(state, {
      phase: 'open',
      openClocks: state.openClocks!,
      beatClocks: clocksAt(phaseInfo.beatOffset ?? 10),
      snapshotVersion: phaseInfo.snapshotVersion ?? 1,
    })
    return { event, websocket: event.vital.websocket as OpenProperties }
  }

  function serializeClosing(state = closingState()) {
    const event = serializeWebSocketVital(state, { phase: 'closing', closingClocks: state.closingClocks! })
    return { event, websocket: event.vital.websocket as ClosingProperties }
  }

  /** Tracking ended on a close event, which is the only way the close outcome is reported. */
  function serializeClosedOnCloseEvent({
    state = closedState(),
    snapshotVersion = 2,
    closeEvent = CLOSE_EVENT,
  }: { state?: TrackedConnectionState; snapshotVersion?: number; closeEvent?: typeof CLOSE_EVENT } = {}) {
    return closedResult(
      serializeWebSocketVital(state, {
        phase: 'closed',
        endClocks: state.endClocks!,
        snapshotVersion,
        trackingEndReason: WebSocketTrackingEndReason.CLOSE_EVENT,
        closeEvent,
      })
    )
  }

  /** Tracking ended with the connection typically still open, so no close event was received. */
  function serializeClosedWithoutCloseEvent({
    state = closedState(),
    snapshotVersion = 2,
    trackingEndReason = WebSocketTrackingEndReason.SESSION_END,
  }: {
    state?: TrackedConnectionState
    snapshotVersion?: number
    trackingEndReason?: Exclude<WebSocketTrackingEndReason, typeof WebSocketTrackingEndReason.CLOSE_EVENT>
  } = {}) {
    return closedResult(
      serializeWebSocketVital(state, {
        phase: 'closed',
        endClocks: state.endClocks!,
        snapshotVersion,
        trackingEndReason,
      })
    )
  }

  function closedResult(event: ReturnType<typeof serializeWebSocketVital>) {
    return { event, websocket: event.vital.websocket as ClosedProperties }
  }

  describe('envelope', () => {
    it('reports a websocket vital, narrowing to the connection id from a raw event', () => {
      const event: RawRumEvent = serializeWebSocketVital(connectingState(), { phase: 'connecting' })

      if (event.type !== RumEventType.VITAL || event.vital.type !== VitalType.WEBSOCKET) {
        fail('expected a websocket vital')
        return
      }

      expect(event.vital.websocket.id).toBe('connection-id')
    })

    it('names the phase it reports', () => {
      expect(serializeConnecting().event.vital.name).toBe(WebSocketVitalName.CONNECTING)
      expect(serializeOpen().event.vital.name).toBe(WebSocketVitalName.OPEN)
      expect(serializeClosing().event.vital.name).toBe(WebSocketVitalName.CLOSING)
      expect(serializeClosedOnCloseEvent().event.vital.name).toBe(WebSocketVitalName.CLOSED)
    })

    it('reports the connection id on every phase, and a fresh vital id per vital', () => {
      const events = [
        serializeConnecting().event,
        serializeOpen().event,
        serializeClosing().event,
        serializeClosedOnCloseEvent().event,
      ]

      expect(events.map((event) => event.vital.websocket.id)).toEqual([
        'connection-id',
        'connection-id',
        'connection-id',
        'connection-id',
      ])
      expect(new Set(events.map((event) => event.vital.id)).size).toBe(4)
    })

    it('dates each vital at the moment it reports, in unix milliseconds', () => {
      expect(serializeConnecting().event.date).toBe(timeStampAt(0))
      expect(serializeOpen(openState(), { beatOffset: 70_000 }).event.date).toBe(timeStampAt(70_000))
      expect(serializeClosing().event.date).toBe(timeStampAt(30))
      expect(serializeClosedOnCloseEvent().event.date).toBe(timeStampAt(50))
    })
  })

  describe('the connecting vital', () => {
    it('reports the identity of the connection', () => {
      const { websocket } = serializeConnecting(
        connectingState({
          url: 'wss://example.com/chat',
          requestedProtocols: ['auth-token', 'chat.v1'],
        })
      )

      expect(websocket.url).toBe('wss://example.com/chat')
      expect(websocket.requested_protocols).toEqual(['auth-token', 'chat.v1'])
      expect(websocket.connecting_date).toBe(timeStampAt(0))
    })

    it('reports the url the connection holds, which is already stripped of its query string', () => {
      // the collection module strips it before the connection is created, and asserts that there
      const { websocket } = serializeConnecting(connectingState({ url: 'wss://example.com/socket' }))

      expect(websocket.url).toBe('wss://example.com/socket')
    })

    it('omits the requested protocols when the connection requested none', () => {
      const { websocket } = serializeConnecting()

      expect(websocket.requested_protocols).toBeUndefined()
    })

    it('reports no snapshot: no message can have been exchanged yet', () => {
      const { websocket } = serializeConnecting()

      expect(fieldsOf(websocket)).toEqual(['id', 'url', 'connecting_date'])
    })
  })

  describe('the open vital', () => {
    it('reports the handshake as succeeded, since it cannot exist otherwise', () => {
      expect(serializeOpen().websocket.open_handshake_succeeded).toBe(true)
    })

    it('reports the connecting duration as the span from the constructor call to the open event', () => {
      const { websocket } = serializeOpen(openState({ openClocks: clocksAt(120) }))

      expect(websocket.connecting_duration).toBe(nanoseconds(120))
      expect(websocket.open_date).toBe(timeStampAt(120))
    })

    it('reports what the server negotiated', () => {
      const { websocket } = serializeOpen(
        openState({ selectedProtocol: 'chat.v1', selectedExtensions: 'permessage-deflate' })
      )

      expect(websocket.selected_protocol).toBe('chat.v1')
      expect(websocket.selected_extensions).toBe('permessage-deflate')
    })

    it('omits the protocol and the extensions when the server negotiated none', () => {
      const { websocket } = serializeOpen()

      expect(websocket.selected_protocol).toBeUndefined()
      expect(websocket.selected_extensions).toBeUndefined()
    })

    it('reports the snapshot version it was given', () => {
      expect(serializeOpen(openState(), { snapshotVersion: 4 }).websocket.snapshot_version).toBe(4)
    })

    it('repeats no identity field: the connecting vital carries them, keyed by connection id', () => {
      const { websocket } = serializeOpen(openState({ url: 'wss://example.com/chat', requestedProtocols: ['chat.v1'] }))

      expect(fieldsOf(websocket)).toEqual([
        'id',
        'open_handshake_succeeded',
        'connecting_duration',
        'open_date',
        'snapshot_version',
        'snapshot',
      ])
    })

    it('reports neither of the two values a snapshot only holds when tracking ended', () => {
      const { websocket } = serializeOpen(
        openState({
          snapshot: {
            inbound: silentDirection({ messageCount: 1, silenceBeforeClose: 5 as Duration }),
            outbound: {
              ...silentDirection({ messageCount: 1, silenceBeforeClose: 5 as Duration }),
              ...silentOutbound({ bufferedAmountAtClose: 128 }),
            },
          },
        })
      )

      expect(websocket.snapshot.inbound.silence_before_close).toBeUndefined()
      expect(websocket.snapshot.outbound.silence_before_close).toBeUndefined()
      expect(websocket.snapshot.outbound.buffered_amount_at_close).toBeUndefined()
    })
  })

  describe('the closing vital', () => {
    it('reports the closing date and the client as the initiator', () => {
      const { websocket } = serializeClosing()

      expect(websocket.closing_date).toBe(timeStampAt(30))
      expect(websocket.close_initiator).toBe('client')
    })

    it('reports no snapshot and no cleanliness: the closed vital carries the terminal ones', () => {
      const { websocket } = serializeClosing()

      expect(fieldsOf(websocket)).toEqual(['id', 'closing_date', 'close_initiator'])
    })
  })

  describe('the closed vital', () => {
    it('reports the closed date and the reason tracking ended', () => {
      const { websocket } = serializeClosedOnCloseEvent()

      expect(websocket.closed_date).toBe(timeStampAt(50))
      expect(websocket.tracking_end_reason).toBe(WebSocketTrackingEndReason.CLOSE_EVENT)
    })

    it('reports the duration as the span from the constructor call to tracking end', () => {
      const { websocket } = serializeClosedOnCloseEvent({ state: closedState({ endClocks: clocksAt(4_000) }) })

      expect(websocket.duration).toBe(nanoseconds(4_000))
    })

    it('reports the full span even for a connection that never opened', () => {
      const { websocket } = serializeClosedOnCloseEvent({
        state: neverOpenedClosedState({ endClocks: clocksAt(4_000) }),
        snapshotVersion: 1,
      })

      expect(websocket.duration).toBe(nanoseconds(4_000))
    })

    it('reports the close outcome of a real close event', () => {
      const { websocket } = serializeClosedOnCloseEvent({
        closeEvent: { code: 1001, reason: 'going away', wasClean: false },
      })

      expect(websocket.close_code).toBe(1001)
      expect(websocket.close_reason).toBe('going away')
      expect(websocket.was_clean).toBe(false)
    })

    it('reports an empty close reason rather than omitting it when the peer supplied none', () => {
      const { websocket } = serializeClosedOnCloseEvent({
        closeEvent: { code: 1000, reason: '', wasClean: true },
      })

      expect(websocket.close_reason).toBe('')
    })

    it('reports no close outcome when tracking ended without a close event', () => {
      const { websocket } = serializeClosedWithoutCloseEvent()

      expect(websocket.tracking_end_reason).toBe(WebSocketTrackingEndReason.SESSION_END)
      expect(websocket.close_code).toBeUndefined()
      expect(websocket.close_reason).toBeUndefined()
      expect(websocket.was_clean).toBeUndefined()
    })

    it('reports the page being unloaded as a terminal of its own', () => {
      const { websocket } = serializeClosedWithoutCloseEvent({
        trackingEndReason: WebSocketTrackingEndReason.PAGE_UNLOADED,
      })

      expect(websocket.tracking_end_reason).toBe(WebSocketTrackingEndReason.PAGE_UNLOADED)
      expect(websocket.close_code).toBeUndefined()
    })

    it('reports the snapshot version it was given, whether or not a snapshot rides with it', () => {
      expect(serializeClosedOnCloseEvent({ snapshotVersion: 7 }).websocket.snapshot_version).toBe(7)
    })

    it('reports no snapshot at all for a connection that never opened, at version 1', () => {
      const { websocket } = serializeClosedOnCloseEvent({ state: neverOpenedClosedState(), snapshotVersion: 1 })

      expect(websocket.snapshot).toBeUndefined()
      expect(websocket.snapshot_version).toBe(1)
    })

    it('reports the two values a snapshot only holds when tracking ended', () => {
      const { websocket } = serializeClosedOnCloseEvent({
        state: closedState({
          snapshot: {
            inbound: silentDirection({ messageCount: 1, silenceBeforeClose: 5 as Duration }),
            outbound: {
              ...silentDirection({ messageCount: 2, silenceBeforeClose: 8 as Duration }),
              ...silentOutbound({ bufferedAmountAtClose: 128 }),
            },
          },
        }),
      })

      expect(websocket.snapshot!.inbound.silence_before_close).toBe(nanoseconds(5))
      expect(websocket.snapshot!.outbound.silence_before_close).toBe(nanoseconds(8))
      expect(websocket.snapshot!.outbound.buffered_amount_at_close).toBe(128)
    })

    it('reports an empty send queue at close as zero rather than omitting it', () => {
      const { websocket } = serializeClosedOnCloseEvent({
        state: closedState({
          snapshot: {
            inbound: silentDirection(),
            outbound: { ...silentDirection(), ...silentOutbound({ bufferedAmountAtClose: 0 }) },
          },
        }),
      })

      expect(websocket.snapshot!.outbound.buffered_amount_at_close).toBe(0)
    })

    it('omits the silence before close in a direction that observed no message', () => {
      const { websocket } = serializeClosedOnCloseEvent()

      expect(websocket.snapshot!.inbound.silence_before_close).toBeUndefined()
      expect(websocket.snapshot!.outbound.silence_before_close).toBeUndefined()
    })

    it('reports no close initiator and no closing duration: both are derived from the vital stream', () => {
      const { websocket } = serializeClosedOnCloseEvent()

      expect(fieldsOf(websocket)).toEqual([
        'id',
        'closed_date',
        'duration',
        'tracking_end_reason',
        'close_code',
        'close_reason',
        'was_clean',
        'snapshot_version',
        'snapshot',
      ])
    })
  })

  describe('the snapshot', () => {
    it('reports both directions whenever it rides, zero-filled when the connection was silent', () => {
      const { websocket } = serializeOpen()

      expect(websocket.snapshot).toEqual({
        inbound: {
          message_count: 0,
          message_size_total: 0,
          message_size_max: 0,
          longest_silence: nanoseconds(0),
          time_to_first_message: undefined,
        },
        outbound: {
          message_count: 0,
          message_size_total: 0,
          message_size_max: 0,
          longest_silence: nanoseconds(0),
          time_to_first_message: undefined,
          buffered_amount_max: 0,
          backpressured_message_count: 0,
        },
      })
    })

    it('reports the message aggregates of both directions', () => {
      const { websocket } = serializeOpen(
        openState({
          snapshot: {
            inbound: silentDirection({
              messageCount: 3,
              messageSizeTotal: 300,
              messageSizeMax: 200,
              timeToFirstMessage: 4 as Duration,
              longestSilence: 12 as Duration,
            }),
            outbound: {
              ...silentDirection({ messageCount: 1, messageSizeTotal: 10, messageSizeMax: 10 }),
              ...silentOutbound({ bufferedAmountMax: 70_000, backpressuredMessageCount: 1 }),
            },
          },
        })
      )

      expect(websocket.snapshot.inbound).toEqual({
        message_count: 3,
        message_size_total: 300,
        message_size_max: 200,
        time_to_first_message: nanoseconds(4),
        longest_silence: nanoseconds(12),
      })
      expect(websocket.snapshot.outbound).toEqual({
        message_count: 1,
        message_size_total: 10,
        message_size_max: 10,
        longest_silence: nanoseconds(0),
        time_to_first_message: undefined,
        buffered_amount_max: 70_000,
        backpressured_message_count: 1,
      })
    })

    it('omits the time to first message until a message has been observed', () => {
      const { websocket } = serializeOpen()

      expect(websocket.snapshot.inbound.time_to_first_message).toBeUndefined()
      expect(websocket.snapshot.outbound.time_to_first_message).toBeUndefined()
    })
  })

  describe('the phases the compiler checks', () => {
    it('requires a snapshot version wherever a snapshot rides', () => {
      const state = closedState()

      // @ts-expect-error a snapshot rides on the open vital, so its version is required
      serializeWebSocketVital(state, { phase: 'open', openClocks: state.openClocks!, beatClocks: clocksAt(10) })
      // @ts-expect-error a snapshot may ride on the closed vital, so its version is required
      serializeWebSocketVital(state, {
        phase: 'closed',
        endClocks: state.endClocks!,
        trackingEndReason: WebSocketTrackingEndReason.SESSION_END,
      })
    })

    it('requires the close event of a close the connection reported, and rejects it otherwise', () => {
      const state = closedState()

      // @ts-expect-error the close outcome is reported by, and only by, a real close event
      serializeWebSocketVital(state, {
        phase: 'closed',
        endClocks: state.endClocks!,
        snapshotVersion: 2,
        trackingEndReason: WebSocketTrackingEndReason.CLOSE_EVENT,
      })
      serializeWebSocketVital(state, {
        phase: 'closed',
        endClocks: state.endClocks!,
        snapshotVersion: 2,
        trackingEndReason: WebSocketTrackingEndReason.SESSION_END,
        // @ts-expect-error tracking that ended without a close event has no close outcome to report
        closeEvent: CLOSE_EVENT,
      })
    })
  })
})

type ConnectingProperties = { id: string } & RawRumWebSocketConnectingVitalProperties
type OpenProperties = { id: string } & RawRumWebSocketOpenVitalProperties
type ClosingProperties = { id: string } & RawRumWebSocketClosingVitalProperties
type ClosedProperties = { id: string } & RawRumWebSocketClosedVitalProperties

/**
 * The fields a payload actually reports, which is what the presence rules are about — a field held
 * as `undefined` is not reported, since the payload is serialized as JSON.
 */
function fieldsOf(websocket: object) {
  return Object.entries(websocket)
    .filter(([, value]) => value !== undefined)
    .map(([field]) => field)
}

import type { ClocksState, TimeStamp } from '@datadog/js-core/time'
import { addDuration, elapsed, toServerDuration } from '@datadog/js-core/time'
import { generateUUID } from '@datadog/browser-core'
import type {
  RawRumWebSocketVitalEvent,
  RawRumWebSocketVitalMessageDirection,
  RawRumWebSocketVitalPayload,
  RawRumWebSocketVitalSnapshot,
} from '../../rawRumEvent.types'
import { RumEventType, VitalType, WebSocketVitalName } from '../../rawRumEvent.types'
import type { MessageDirectionAggregate, TrackedConnectionState, WebSocketSnapshot } from './trackedConnection'

/**
 * Maps a tracked connection to the vital of one of its phases. Durations become nanoseconds here
 * and dates stay unix milliseconds; the connection accumulates in milliseconds and subtracts
 * nothing, so the two lifetime spans are computed here too.
 *
 * The connection is measured on its own timeline: every span is taken on the monotonic clock, and
 * the only date sampled from the system clock is the connecting date, which the dates of the later
 * phases are placed from. A change of the system clock mid-connection therefore shifts none of them,
 * while the vital itself stays dated by the system clock, like every other event.
 *
 * The presence rules live here in full, because the shipped schema enforces almost none of them:
 * identity rides the connecting vital only, and the snapshot rides only where something can have
 * been exchanged.
 */
export function serializeWebSocketVital(state: TrackedConnectionState): RawRumWebSocketVitalEvent {
  const id = state.id
  const connectingClocks = state.connectingClocks
  const connectingDate = connectingClocks.timeStamp
  const date = webSocketVitalClocks(state).timeStamp

  switch (state.phase) {
    case 'connecting':
      return toRawVital(date, {
        name: WebSocketVitalName.CONNECTING,
        websocket: {
          id,
          url: state.url,
          requested_protocols: state.requestedProtocols,
          connecting_date: connectingDate,
        },
      })

    case 'open':
      return toRawVital(date, {
        name: WebSocketVitalName.OPEN,
        websocket: {
          id,
          connecting_duration: toServerDuration(elapsed(connectingClocks.relative, state.openClocks.relative)),
          open_date: toPhaseDate(connectingClocks, state.openClocks),
          selected_protocol: state.selectedProtocol,
          selected_extensions: state.selectedExtensions,
          snapshot_version: state.snapshotVersion,
          snapshot: serializeSnapshot(state.snapshot),
        },
      })

    case 'closing':
      return toRawVital(date, {
        name: WebSocketVitalName.CLOSING,
        websocket: {
          id,
          closing_date: toPhaseDate(connectingClocks, state.closingClocks),
          close_initiator: 'client',
        },
      })

    case 'closed':
      return toRawVital(date, {
        name: WebSocketVitalName.CLOSED,
        websocket: {
          id,
          closed_date: toPhaseDate(connectingClocks, state.endClocks),
          duration: toServerDuration(elapsed(connectingClocks.relative, state.endClocks.relative)),
          tracking_end_reason: state.trackingEndReason,
          close_code: state.closeEvent?.code,
          close_reason: state.closeEvent?.reason,
          was_clean: state.closeEvent?.wasClean,
          snapshot_version: state.snapshotVersion,
          // a connection that never opened exchanged nothing, and reports nothing rather than a
          // zero-filled snapshot
          snapshot: state.openClocks && serializeSnapshot(state.snapshot),
        },
      })
  }
}

/**
 * When the phase being reported happened. It is both what the vital is dated at and what assembly
 * attributes it to a view by, derived once so the two cannot disagree — a vital dated at one moment
 * and attributed to another would be wrong with nothing to catch it.
 */
export function webSocketVitalClocks(state: TrackedConnectionState): ClocksState {
  switch (state.phase) {
    case 'connecting':
      return state.connectingClocks
    case 'open':
      return state.openClocks
    case 'closing':
      return state.closingClocks
    case 'closed':
      return state.endClocks
  }
}

/**
 * The date a phase is reported at: the connecting date, plus the time elapsed since on the monotonic
 * clock rather than the system clock, which can jump in between. Rounded, because the monotonic clock
 * has sub-millisecond precision and dates are whole milliseconds.
 */
function toPhaseDate(connectingClocks: ClocksState, phaseClocks: ClocksState): TimeStamp {
  return Math.round(
    addDuration(connectingClocks.timeStamp, elapsed(connectingClocks.relative, phaseClocks.relative))
  ) as TimeStamp
}

/** The envelope every phase rides in, written once: a vital of its own, identifying the phase. */
function toRawVital(date: TimeStamp, payload: RawRumWebSocketVitalPayload): RawRumWebSocketVitalEvent {
  return {
    date,
    type: RumEventType.VITAL,
    vital: { id: generateUUID(), type: VitalType.WEBSOCKET, ...payload },
  }
}

/**
 * The values that change from one vital of a connection to the next. The two directions measure the
 * same things, so the mapping is written once and applied to each of them.
 */
function serializeSnapshot({ inbound, outbound }: WebSocketSnapshot): RawRumWebSocketVitalSnapshot {
  return {
    inbound: serializeMessageDirection(inbound),
    outbound: {
      ...serializeMessageDirection(outbound),
      buffered_amount_max: outbound.bufferedAmountMax,
    },
  }
}

function serializeMessageDirection(direction: MessageDirectionAggregate): RawRumWebSocketVitalMessageDirection {
  return {
    message_count: direction.messageCount,
    message_size_total: direction.messageSizeTotal,
    message_size_max: direction.messageSizeMax,
    longest_silence: toServerDuration(direction.longestSilence),
  }
}

import type { ClocksState, TimeStamp } from '@datadog/js-core/time'
import { elapsed, toServerDuration } from '@datadog/js-core/time'
import { generateUUID } from '@datadog/browser-core'
import type {
  RawRumWebSocketVitalEvent,
  RawRumWebSocketVitalMessageDirection,
  RawRumWebSocketVitalPayload,
  RawRumWebSocketVitalSnapshot,
  WebSocketTrackingEndReason,
} from '../../rawRumEvent.types'
import { RumEventType, VitalType, WebSocketVitalName } from '../../rawRumEvent.types'
import type { MessageDirectionAggregate, TrackedConnectionState, WebSocketSnapshot } from './trackedConnection'

/** What a `close` event tells us, and the only thing no tracked connection holds. */
export interface WebSocketCloseEvent {
  code: number
  reason: string
  wasClean: boolean
}

interface ConnectingPhaseInfo {
  phase: 'connecting'
}

interface OpenPhaseInfo {
  phase: 'open'
  /**
   * When the handshake completed, which is what the vital reports as the open date. It is the
   * arrival of this phase, so it is carried here rather than read off the connection, where the
   * phase does not make it required and reading it would mean asserting it away.
   */
  openClocks: ClocksState
  /**
   * When this particular vital was taken, which is what it is dated at. It is the open event on the
   * first one and the beat on every heartbeat after it, and the two coincide only on the first.
   */
  beatClocks: ClocksState
  snapshotVersion: number
}

interface ClosingPhaseInfo {
  phase: 'closing'
  closingClocks: ClocksState
}

interface ClosedPhaseInfoCommonProperties {
  phase: 'closed'
  endClocks: ClocksState
  snapshotVersion: number
}

/**
 * The close outcome is reported by, and only by, a real close event, so the reason tracking ended
 * and the presence of the event are one choice rather than two — nothing in the schema rejects a
 * close code on a session that merely expired.
 */
type ClosedPhaseInfo =
  | (ClosedPhaseInfoCommonProperties & {
      trackingEndReason: typeof WebSocketTrackingEndReason.CLOSE_EVENT
      closeEvent: WebSocketCloseEvent
    })
  | (ClosedPhaseInfoCommonProperties & {
      trackingEndReason: Exclude<WebSocketTrackingEndReason, typeof WebSocketTrackingEndReason.CLOSE_EVENT>
      closeEvent?: never
    })

/**
 * What the phase being reported adds to what the connection knows: the clocks of its arrival, the
 * snapshot version wherever a snapshot rides, and the close facts, which arrive with the event
 * rather than living in the connection. Discriminated on the phase because this is the last place
 * the compiler can check the four of them — the shipped schema does not narrow on the vital name.
 */
export type WebSocketVitalPhaseInfo = ConnectingPhaseInfo | OpenPhaseInfo | ClosingPhaseInfo | ClosedPhaseInfo

/**
 * Maps a tracked connection to the vital of one of its phases. Durations become nanoseconds here
 * and dates stay unix milliseconds; the connection accumulates in milliseconds and subtracts
 * nothing, so the two lifetime spans are computed here too.
 *
 * The presence rules live here in full, because the shipped schema enforces almost none of them:
 * identity rides the connecting vital only, the snapshot rides only where something can have been
 * exchanged, and the close-suffixed values ride the terminal snapshot only.
 */
export function serializeWebSocketVital(
  state: TrackedConnectionState,
  phaseInfo: WebSocketVitalPhaseInfo
): RawRumWebSocketVitalEvent {
  const id = state.id
  const connectingDate = state.connectingClocks.timeStamp

  switch (phaseInfo.phase) {
    case 'connecting':
      return toRawVital(connectingDate, {
        name: WebSocketVitalName.CONNECTING,
        websocket: {
          id,
          url: state.url,
          requested_protocols: state.requestedProtocols,
          connecting_date: connectingDate,
        },
      })

    case 'open': {
      const openDate = phaseInfo.openClocks.timeStamp

      return toRawVital(phaseInfo.beatClocks.timeStamp, {
        name: WebSocketVitalName.OPEN,
        websocket: {
          id,
          // an open vital cannot exist otherwise, and the constant keeps it self-describing
          open_handshake_succeeded: true,
          connecting_duration: toServerDuration(elapsed(connectingDate, openDate)),
          open_date: openDate,
          selected_protocol: state.selectedProtocol,
          selected_extensions: state.selectedExtensions,
          snapshot_version: phaseInfo.snapshotVersion,
          snapshot: serializeSnapshot(state.snapshot),
        },
      })
    }

    case 'closing':
      return toRawVital(phaseInfo.closingClocks.timeStamp, {
        name: WebSocketVitalName.CLOSING,
        websocket: {
          id,
          closing_date: phaseInfo.closingClocks.timeStamp,
          close_initiator: 'client',
        },
      })

    case 'closed': {
      const closedDate = phaseInfo.endClocks.timeStamp

      return toRawVital(closedDate, {
        name: WebSocketVitalName.CLOSED,
        websocket: {
          id,
          closed_date: closedDate,
          duration: toServerDuration(elapsed(connectingDate, closedDate)),
          tracking_end_reason: phaseInfo.trackingEndReason,
          close_code: phaseInfo.closeEvent?.code,
          close_reason: phaseInfo.closeEvent?.reason,
          was_clean: phaseInfo.closeEvent?.wasClean,
          snapshot_version: phaseInfo.snapshotVersion,
          // a connection that never opened exchanged nothing, and reports nothing rather than a
          // zero-filled snapshot
          snapshot: state.openClocks && serializeTerminalSnapshot(state.snapshot),
        },
      })
    }
  }
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
      backpressured_message_count: outbound.backpressuredMessageCount,
    },
  }
}

/**
 * The terminal snapshot, which is the only one reporting the two values measured against the date
 * tracking ended. They are added here rather than by the shared mapping so that a heartbeat cannot
 * carry them — nothing in the schema would reject it if it did.
 */
function serializeTerminalSnapshot(snapshot: WebSocketSnapshot): RawRumWebSocketVitalSnapshot {
  const { inbound, outbound } = snapshot
  const serialized = serializeSnapshot(snapshot)

  return {
    inbound: {
      ...serialized.inbound,
      silence_before_close: toServerDuration(inbound.silenceBeforeClose),
    },
    outbound: {
      ...serialized.outbound,
      silence_before_close: toServerDuration(outbound.silenceBeforeClose),
      buffered_amount_at_close: outbound.bufferedAmountAtClose,
    },
  }
}

function serializeMessageDirection(direction: MessageDirectionAggregate): RawRumWebSocketVitalMessageDirection {
  return {
    message_count: direction.messageCount,
    message_size_total: direction.messageSizeTotal,
    message_size_max: direction.messageSizeMax,
    time_to_first_message: toServerDuration(direction.timeToFirstMessage),
    longest_silence: toServerDuration(direction.longestSilence),
  }
}

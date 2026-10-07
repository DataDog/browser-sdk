import type { ClocksState, Duration, RelativeTime } from '@datadog/js-core/time'
import { elapsed } from '@datadog/js-core/time'
import type { WebSocketTrackingEndReason } from '../../rawRumEvent.types'

/**
 * Lifecycle phase of a connection, as defined by RFC 6455. Held as explicit data so no reader has
 * to infer it from which fields happen to be populated.
 */
export type WebSocketPhase = 'connecting' | 'open' | 'closed'

export interface MessageDirectionAggregate {
  messageCount: number
  messageSizeTotal: number
  messageSizeMax: number
  /** Longest interval between two messages. */
  longestSilence: Duration
}

export interface OutboundAggregate extends MessageDirectionAggregate {
  /** Deepest send queue observed, counted after each payload was enqueued. */
  bufferedAmountMax: number
}

export interface WebSocketSnapshot {
  inbound: MessageDirectionAggregate
  outbound: OutboundAggregate
}

/** What is known about a connection from the constructor call, and never changes afterwards. */
export interface TrackedConnectionIdentity {
  /** The connection id, shared by every vital this connection reports. */
  id: string
  url: string
  requestedProtocols?: string[]
  connectingClocks: ClocksState
}

/** What the `open` event tells us, none of which is knowable before it fires. */
export interface OpenFacts {
  openClocks: ClocksState
  selectedProtocol?: string
  selectedExtensions?: string
}

/** What a `close` event tells us. */
export interface WebSocketCloseEvent {
  code: number
  reason: string
  wasClean: boolean
}

/**
 * Why tracking ended. The close outcome is reported by, and only by, a real close event, so the
 * reason and the presence of the event are one choice rather than two — nothing in the schema
 * rejects a close code on a session that merely expired.
 */
export type WebSocketTrackingEnd =
  | {
      trackingEndReason: Extract<WebSocketTrackingEndReason, 'close_event'>
      closeEvent: WebSocketCloseEvent
    }
  | {
      trackingEndReason: Exclude<WebSocketTrackingEndReason, 'close_event'>
      closeEvent?: never
    }

/**
 * What the connection knows by having reached its current phase, narrowed on that phase. Each phase
 * holds what its own vital reports, and carries nothing over from the phases before it.
 */
type PhaseFacts =
  | { phase: 'connecting' }
  | (OpenFacts & { phase: 'open'; snapshotVersion: number })
  | ({ phase: 'closed'; endClocks: ClocksState; snapshotVersion: number; hasOpened: boolean } & WebSocketTrackingEnd)

/**
 * The state of a WebSocket connection at a given moment, narrowed on the phase so each vital can
 * read required fields without asserting them away.
 */
export type TrackedConnectionState = TrackedConnectionIdentity & PhaseFacts & { snapshot: WebSocketSnapshot }

export interface TrackedConnection {
  getState: () => TrackedConnectionState
  /** The current phase alone, without the snapshot a full state read computes. */
  getPhase: () => WebSocketPhase
  recordOpen: (facts: OpenFacts) => void
  recordInboundMessage: (size: number, at: RelativeTime) => void
  recordOutboundMessage: (size: number, bufferedAmountPreSend: number, at: RelativeTime) => void
  /** Ends tracking, whatever the reason. */
  recordTrackingEnd: (endClocks: ClocksState, trackingEnd: WebSocketTrackingEnd) => void
}

/**
 * A factory to create gatherer objects that hold the data of a WebSocket connection, it performs the necessary
 * arithmetic to produce snapshots of the state of the connection at different phases of its lifecycle.
 */
export function createTrackedConnection({
  id,
  url,
  requestedProtocols,
  connectingClocks,
}: TrackedConnectionIdentity): TrackedConnection {
  const inbound = createMessageDirectionAggregate()
  const outbound: OutboundAggregate = {
    ...createMessageDirectionAggregate(),
    bufferedAmountMax: 0,
  }
  // held as one value, so a phase cannot be reached without the facts that come with it
  let phaseFacts: PhaseFacts = { phase: 'connecting' }
  // continued across phases: the closed vital follows the open one
  let snapshotVersion = 0
  // the cursor the silence arithmetic runs on, one per direction: it is what the connection needs
  // to measure a gap, not something it reports
  let lastInboundMessageAt: RelativeTime | undefined
  let lastOutboundMessageAt: RelativeTime | undefined

  function nextSnapshotVersion() {
    snapshotVersion += 1
    return snapshotVersion
  }

  function readSnapshot(): WebSocketSnapshot {
    return {
      inbound: { ...inbound },
      outbound: { ...outbound },
    }
  }

  function identityFields(): TrackedConnectionIdentity {
    return {
      id,
      url,
      requestedProtocols: requestedProtocols?.slice(),
      connectingClocks,
    }
  }

  return {
    getState: () => ({
      ...identityFields(),
      ...phaseFacts,
      snapshot: readSnapshot(),
    }),

    getPhase: () => phaseFacts.phase,

    recordOpen: (facts) => {
      phaseFacts = {
        ...facts,
        phase: 'open',
        snapshotVersion: nextSnapshotVersion(),
      }
    },

    recordInboundMessage: (size, at) => {
      recordMessage(inbound, lastInboundMessageAt, size, at)
      lastInboundMessageAt = at
    },

    recordOutboundMessage: (size, bufferedAmountPreSend, at) => {
      // the peak is counted after the payload is enqueued, from the pre-send queue depth:
      // `send()` grows the queue by exactly the payload size, whereas reading the socket again
      // could catch a queue the browser has already partly flushed and understate the peak
      outbound.bufferedAmountMax = Math.max(outbound.bufferedAmountMax, bufferedAmountPreSend + size)
      recordMessage(outbound, lastOutboundMessageAt, size, at)
      lastOutboundMessageAt = at
    },

    recordTrackingEnd: (clocks, end) => {
      phaseFacts = {
        phase: 'closed',
        endClocks: clocks,
        snapshotVersion: nextSnapshotVersion(),
        hasOpened: phaseFacts.phase === 'open',
        ...end,
      }
    },
  }
}

function createMessageDirectionAggregate(): MessageDirectionAggregate {
  return {
    messageCount: 0,
    messageSizeTotal: 0,
    messageSizeMax: 0,
    longestSilence: 0 as Duration,
  }
}

/**
 * The message arithmetic, written once and applied to whichever direction it is given — the two
 * directions measure the same things, so there is no direction to branch on.
 */
function recordMessage(
  aggregate: MessageDirectionAggregate,
  lastMessageAt: RelativeTime | undefined,
  size: number,
  at: RelativeTime
) {
  // the interval before the first message is not a silence
  if (lastMessageAt !== undefined) {
    aggregate.longestSilence = maxDuration(aggregate.longestSilence, elapsed(lastMessageAt, at))
  }

  aggregate.messageCount += 1
  aggregate.messageSizeTotal += size
  aggregate.messageSizeMax = Math.max(aggregate.messageSizeMax, size)
}

function maxDuration(first: Duration, second: Duration) {
  return Math.max(first, second) as Duration
}

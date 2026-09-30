import type { ClocksState, Duration, RelativeTime } from '@datadog/js-core/time'
import { elapsed, relativeNow } from '@datadog/js-core/time'

/**
 * Lifecycle phase of a connection, as defined by RFC 6455. Held as explicit data so no reader has
 * to infer it from which fields happen to be populated.
 */
export type WebSocketPhase = 'connecting' | 'open' | 'closing' | 'closed'

export interface MessageDirectionAggregate {
  messageCount: number
  messageSizeTotal: number
  messageSizeMax: number
  /** Offset from the open date to the first message, kept once set. */
  timeToFirstMessage?: Duration
  /** Longest interval between two messages, including the one still open at read time. */
  longestSilence: Duration
  /** Interval from the last message to the tracking end date. Derived on read, once closed. */
  silenceBeforeClose?: Duration
}

export interface OutboundAggregate extends MessageDirectionAggregate {
  /** Deepest send queue observed, counted after each payload was enqueued. */
  bufferedAmountMax: number
  /** Send queue depth the socket reported when tracking ended. */
  bufferedAmountAtClose?: number
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

/**
 * The state of a WebSocket connection at a given moment during any phase of its lifecycle.
 */
export interface TrackedConnectionState extends TrackedConnectionIdentity {
  phase: WebSocketPhase
  openClocks?: ClocksState
  selectedProtocol?: string
  selectedExtensions?: string
  closingClocks?: ClocksState
  /** Set when tracking ended, whatever the reason for it ending (might not be a close event). */
  endClocks?: ClocksState
  snapshot: WebSocketSnapshot
}

export interface TrackedConnection {
  /**
   * Reads the connection as of `readAt` when given, otherwise as of now. Once tracking has ended,
   * the tracking end date always wins so the terminal snapshot stays stable.
   */
  getState: (readAt?: RelativeTime) => TrackedConnectionState
  /** Increments and returns the version the next snapshot-carrying vital rides on. */
  nextSnapshotVersion: () => number
  recordOpen: (facts: OpenFacts) => void
  recordInboundMessage: (size: number, at: RelativeTime) => void
  recordOutboundMessage: (size: number, bufferedAmountPreSend: number, at: RelativeTime) => void
  recordClosing: (closingClocks: ClocksState) => void
  /**
   * Ends tracking, whatever the reason. `bufferedAmount` is the send queue depth read from the
   * socket at that moment, handed in rather than read here so this module needs no socket.
   */
  recordTrackingEnd: (endClocks: ClocksState, bufferedAmount: number) => void
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
  let phase: WebSocketPhase = 'connecting'
  let openClocks: ClocksState | undefined
  let selectedProtocol: string | undefined
  let selectedExtensions: string | undefined
  let closingClocks: ClocksState | undefined
  let endClocks: ClocksState | undefined
  let snapshotVersion = 0
  // the cursor the silence arithmetic runs on, one per direction: it is what the connection needs
  // to measure a gap, not something it reports
  let lastInboundMessageAt: RelativeTime | undefined
  let lastOutboundMessageAt: RelativeTime | undefined

  return {
    getState: (snapshotReadAt) => {
      // reads close the silence still in progress: at the tracking end once tracking has ended, so
      // that the terminal snapshot is stable; at an explicit read time when the caller freezes the
      // snapshot to a known date (a heartbeat pulse); and at the moment of the read until then
      const readAt = endClocks ? endClocks.relative : (snapshotReadAt ?? relativeNow())
      const hasEnded = endClocks !== undefined

      return {
        phase,
        id,
        url,
        requestedProtocols: requestedProtocols?.slice(),
        connectingClocks,
        openClocks,
        selectedProtocol,
        selectedExtensions,
        closingClocks,
        endClocks,
        snapshot: {
          inbound: readMessageDirection(inbound, lastInboundMessageAt, readAt, hasEnded),
          outbound: readMessageDirection(outbound, lastOutboundMessageAt, readAt, hasEnded),
        },
      }
    },

    nextSnapshotVersion: () => (snapshotVersion += 1),

    recordOpen: (facts) => {
      phase = 'open'
      openClocks = facts.openClocks
      selectedProtocol = facts.selectedProtocol
      selectedExtensions = facts.selectedExtensions
    },

    recordInboundMessage: (size, at) => {
      recordMessage(inbound, lastInboundMessageAt, size, at, openClocks)
      lastInboundMessageAt = at
    },

    recordOutboundMessage: (size, bufferedAmountPreSend, at) => {
      // the peak is counted after the payload is enqueued, from the pre-send queue depth:
      // `send()` grows the queue by exactly the payload size, whereas reading the socket again
      // could catch a queue the browser has already partly flushed and understate the peak
      outbound.bufferedAmountMax = Math.max(outbound.bufferedAmountMax, bufferedAmountPreSend + size)
      recordMessage(outbound, lastOutboundMessageAt, size, at, openClocks)
      lastOutboundMessageAt = at
    },

    recordClosing: (clocks) => {
      phase = 'closing'
      closingClocks = clocks
    },

    recordTrackingEnd: (clocks, bufferedAmount) => {
      phase = 'closed'
      endClocks = clocks
      outbound.bufferedAmountAtClose = bufferedAmount
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
  at: RelativeTime,
  openClocks: ClocksState | undefined
) {
  if (lastMessageAt === undefined) {
    // the interval before the first message is the time to first message, not a silence
    if (openClocks) {
      aggregate.timeToFirstMessage = elapsed(openClocks.relative, at)
    }
  } else {
    aggregate.longestSilence = maxDuration(aggregate.longestSilence, elapsed(lastMessageAt, at))
  }

  aggregate.messageCount += 1
  aggregate.messageSizeTotal += size
  aggregate.messageSizeMax = Math.max(aggregate.messageSizeMax, size)
}

/**
 * Copies a direction's aggregate, deriving the two values that depend on when it is read rather
 * than on what was recorded.
 */
function readMessageDirection<Aggregate extends MessageDirectionAggregate>(
  aggregate: Aggregate,
  lastMessageAt: RelativeTime | undefined,
  readAt: RelativeTime,
  hasEnded: boolean
): Aggregate {
  const read = { ...aggregate }

  if (lastMessageAt !== undefined) {
    const silenceSinceLastMessage = elapsed(lastMessageAt, readAt)
    // counting the gap still open is what makes the value meaningful on a repeated read: a socket
    // quiet for five minutes reports five minutes rather than the last gap it happened to complete
    read.longestSilence = maxDuration(read.longestSilence, silenceSinceLastMessage)
    if (hasEnded) {
      read.silenceBeforeClose = silenceSinceLastMessage
    }
  }

  return read
}

function maxDuration(first: Duration, second: Duration) {
  return Math.max(first, second) as Duration
}

import type { ClocksState, Duration, RelativeTime } from '@datadog/js-core/time'
import { elapsed, relativeNow } from '@datadog/js-core/time'
import type { WebSocketTrackingEndReason } from '../../rawRumEvent.types'

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

interface ConnectingPhase {
  phase: 'connecting'
}

interface OpenPhase extends OpenFacts {
  phase: 'open'
  /**
   * When this particular open vital was taken. It is the open event on the first one and the pulse
   * on every heartbeat after it; open snapshot reads freeze here.
   */
  pulseClocks: ClocksState
  snapshotVersion: number
}

// the open facts are absent when `close()` was called during the handshake
interface ClosingPhase extends Partial<OpenFacts> {
  phase: 'closing'
  closingClocks: ClocksState
}

// the open facts are absent when the connection never opened
type ClosedPhase = Partial<OpenFacts> & {
  phase: 'closed'
  closingClocks?: ClocksState
  endClocks: ClocksState
  snapshotVersion: number
} & WebSocketTrackingEnd

/** What the connection knows by having reached its current phase, narrowed on that phase. */
type PhaseFacts = ConnectingPhase | OpenPhase | ClosingPhase | ClosedPhase

/**
 * The state of a WebSocket connection at a given moment, narrowed on the phase so each vital can
 * read required fields without asserting them away.
 */
export type TrackedConnectionState = TrackedConnectionIdentity & PhaseFacts & { snapshot: WebSocketSnapshot }

export interface TrackedConnection {
  /**
   * Reads the connection as of its phase clocks: the pulse while open, the tracking end once
   * closed, and now during connecting/closing.
   */
  getState: () => TrackedConnectionState
  /** The current phase alone, without the snapshot a full state read computes. */
  getPhase: () => WebSocketPhase
  recordOpen: (facts: OpenFacts) => void
  /**
   * Sets the pulse the next open vital (and any open-state read) freezes at, and bumps the snapshot
   * version that vital rides on. Ignored outside the open phase, which is the only one with a pulse.
   */
  recordPulse: (pulseClocks: ClocksState) => void
  recordInboundMessage: (size: number, at: RelativeTime) => void
  recordOutboundMessage: (size: number, bufferedAmountPreSend: number, at: RelativeTime) => void
  recordClosing: (closingClocks: ClocksState) => void
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
  // continued across phases: the closing phase carries no version, but the closed vital follows the
  // open ones
  let snapshotVersion = 0
  // the cursor the silence arithmetic runs on, one per direction: it is what the connection needs
  // to measure a gap, not something it reports
  let lastInboundMessageAt: RelativeTime | undefined
  let lastOutboundMessageAt: RelativeTime | undefined

  function nextSnapshotVersion() {
    snapshotVersion += 1
    return snapshotVersion
  }

  function readSnapshot(readAt: RelativeTime, hasEnded: boolean): WebSocketSnapshot {
    return {
      inbound: readMessageDirection(inbound, lastInboundMessageAt, readAt, hasEnded),
      outbound: readMessageDirection(outbound, lastOutboundMessageAt, readAt, hasEnded),
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

  /**
   * Where reads close the silence still in progress: at the pulse while open, so the vital and the
   * snapshot agree; at the tracking end once closed, so that the terminal snapshot is stable; and at
   * the moment of the read otherwise.
   */
  function readAtOf(facts: PhaseFacts): RelativeTime {
    switch (facts.phase) {
      case 'open':
        return facts.pulseClocks.relative
      case 'closed':
        return facts.endClocks.relative
      case 'connecting':
      case 'closing':
        return relativeNow()
    }
  }

  return {
    getState: () => ({
      ...identityFields(),
      ...phaseFacts,
      snapshot: readSnapshot(readAtOf(phaseFacts), phaseFacts.phase === 'closed'),
    }),

    getPhase: () => phaseFacts.phase,

    recordOpen: (facts) => {
      phaseFacts = {
        ...facts,
        phase: 'open',
        pulseClocks: facts.openClocks,
        snapshotVersion: nextSnapshotVersion(),
      }
    },

    recordPulse: (clocks) => {
      if (phaseFacts.phase !== 'open') {
        return
      }
      phaseFacts = { ...phaseFacts, pulseClocks: clocks, snapshotVersion: nextSnapshotVersion() }
    },

    recordInboundMessage: (size, at) => {
      recordMessage(inbound, lastInboundMessageAt, size, at, openClocksOf(phaseFacts))
      lastInboundMessageAt = at
    },

    recordOutboundMessage: (size, bufferedAmountPreSend, at) => {
      // the peak is counted after the payload is enqueued, from the pre-send queue depth:
      // `send()` grows the queue by exactly the payload size, whereas reading the socket again
      // could catch a queue the browser has already partly flushed and understate the peak
      outbound.bufferedAmountMax = Math.max(outbound.bufferedAmountMax, bufferedAmountPreSend + size)
      recordMessage(outbound, lastOutboundMessageAt, size, at, openClocksOf(phaseFacts))
      lastOutboundMessageAt = at
    },

    recordClosing: (clocks) => {
      phaseFacts = { ...openFactsOf(phaseFacts), phase: 'closing', closingClocks: clocks }
    },

    recordTrackingEnd: (clocks, end) => {
      phaseFacts = {
        ...openFactsOf(phaseFacts),
        closingClocks: 'closingClocks' in phaseFacts ? phaseFacts.closingClocks : undefined,
        phase: 'closed',
        endClocks: clocks,
        snapshotVersion: nextSnapshotVersion(),
        ...end,
      }
    },
  }
}

function openClocksOf(facts: PhaseFacts): ClocksState | undefined {
  return facts.phase === 'connecting' ? undefined : facts.openClocks
}

/** The open facts a phase carries over, none for a connection that has not opened (yet). */
function openFactsOf(facts: PhaseFacts): Partial<OpenFacts> {
  if (facts.phase === 'connecting') {
    return {}
  }
  const { openClocks, selectedProtocol, selectedExtensions } = facts
  return { openClocks, selectedProtocol, selectedExtensions }
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

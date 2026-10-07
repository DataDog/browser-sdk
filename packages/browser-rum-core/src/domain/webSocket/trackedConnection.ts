import { generateUUID } from '@datadog/browser-core'
import type { ClocksState, Duration, RelativeTime } from '@datadog/js-core/time'
import { elapsed } from '@datadog/js-core/time'
import { buildUrl, deepClone } from '@datadog/js-core/util'
import type {
  WebSocketClosedContext,
  WebSocketClosingContext,
  WebSocketConnectingContext,
  WebSocketMessageInContext,
  WebSocketMessageOutContext,
  WebSocketOpenContext,
} from '../../browser/webSocketObservable'
import { WebSocketTrackingEndReason } from '../../rawRumEvent.types'
import type { UnobservedTrackingEndReason } from './webSocketCollection'

export interface MessageDirectionAggregate {
  messageCount: number
  messageSizeTotal: number
  messageSizeMax: number
  /** Longest interval between two messages. */
  longestSilence: Duration
}

export interface WebSocketSnapshot {
  inbound: MessageDirectionAggregate
  outbound: MessageDirectionAggregate
  /** Deepest send queue observed, counted after each payload was enqueued. */
  bufferedAmountMax: number
}

/**
 * The state of a WebSocket connection at a given moment, narrowed on its lifecycle phase (as defined
 * by RFC 6455) so each vital can read required fields without asserting them away. Each phase holds
 * what its own vital reports, and carries nothing over from the phases before it.
 */
export type TrackedConnectionState = {
  /** The connection id, shared by every vital this connection reports. */
  id: string
  connectingClocks: ClocksState
} & (
  | { phase: 'connecting'; url: string; requestedProtocols?: string[] }
  | {
      phase: 'open'
      openClocks: ClocksState
      /**
       * When this particular open vital was taken. It is the open event on the first one and the
       * periodic report on every one after it.
       */
      reportClocks: ClocksState
      selectedProtocol?: string
      selectedExtensions?: string
      snapshotVersion: number
      snapshot: WebSocketSnapshot
    }
  | { phase: 'closing'; closingClocks: ClocksState }
  | {
      phase: 'closed'
      endClocks: ClocksState
      trackingEndReason: WebSocketTrackingEndReason
      /** Present exactly when tracking ended on a close event, the one source of the close outcome. */
      closeEvent?: { code: number; reason: string; wasClean: boolean }
      snapshotVersion: number
      /** Omitted when the connection never opened: it exchanged nothing, so it reports nothing. */
      snapshot?: WebSocketSnapshot
    }
)

export interface TrackedConnection {
  getState: () => TrackedConnectionState
  isOpen: () => boolean
  recordOpen: (context: WebSocketOpenContext) => void
  /**
   * Sets the date the next open vital is reported at, and bumps the snapshot version that vital
   * rides on. Ignored outside the open phase, which is the only one reported periodically.
   */
  recordReport: (reportClocks: ClocksState) => void
  recordInboundMessage: (context: WebSocketMessageInContext) => void
  recordOutboundMessage: (context: WebSocketMessageOutContext) => void
  recordClosing: (context: WebSocketClosingContext) => void
  /**
   * Ends tracking on a close event. The close outcome is reported by, and only by, a real close
   * event, so this is the one way to end tracking with one.
   */
  recordClose: (context: WebSocketClosedContext) => void
  /** Ends tracking without a close event, so with no close outcome to report. */
  recordTrackingEnd: (endClocks: ClocksState, trackingEndReason: UnobservedTrackingEndReason) => void
}

/**
 * A factory to create gatherer objects that hold the data of a WebSocket connection, it performs the necessary
 * arithmetic to produce snapshots of the state of the connection at different phases of its lifecycle.
 */
export function createTrackedConnection({
  url,
  protocols,
  startClocks,
}: WebSocketConnectingContext): TrackedConnection {
  const id = generateUUID()
  const connectingClocks = startClocks
  // accumulated as messages are recorded, and referenced by the states that report it
  const snapshot: WebSocketSnapshot = {
    inbound: createMessageDirectionAggregate(),
    outbound: createMessageDirectionAggregate(),
    bufferedAmountMax: 0,
  }
  // held as one value, so a phase cannot be reached without the facts that come with it
  let state: TrackedConnectionState = {
    id,
    connectingClocks,
    phase: 'connecting',
    url: sanitizeWebSocketUrl(url),
    requestedProtocols: toRequestedProtocols(protocols),
  }
  // continued across phases: the closing phase carries no version, but the closed vital follows the
  // open ones
  let snapshotVersion = 0
  // the cursor the silence arithmetic runs on, one per direction: it is what the connection needs
  // to measure a gap, not something it reports
  let lastInboundMessageAt: RelativeTime | undefined
  let lastOutboundMessageAt: RelativeTime | undefined
  // what the time to first message is measured from, kept apart from the state because messages
  // still arrive while closing, a phase that holds no open date
  let openClocks: ClocksState | undefined

  function nextSnapshotVersion() {
    snapshotVersion += 1
    return snapshotVersion
  }

  function endTracking(
    endClocks: ClocksState,
    trackingEndReason: WebSocketTrackingEndReason,
    closeEvent?: { code: number; reason: string; wasClean: boolean }
  ) {
    state = {
      id,
      connectingClocks,
      phase: 'closed',
      endClocks,
      trackingEndReason,
      closeEvent,
      snapshotVersion: nextSnapshotVersion(),
      snapshot: openClocks ? snapshot : undefined,
    }
  }

  return {
    getState: () => deepClone(state),

    isOpen: () => state.phase === 'open',

    recordOpen: (context) => {
      openClocks = context.openClocks
      state = {
        id,
        connectingClocks,
        phase: 'open',
        openClocks,
        // a copy, as `getState`'s deep clone drops an object it has already seen in the state
        reportClocks: { ...openClocks },
        // These are reported as empty strings when none were specified
        selectedProtocol: context.protocol || undefined,
        selectedExtensions: context.extensions || undefined,
        snapshotVersion: nextSnapshotVersion(),
        snapshot,
      }
    },

    recordReport: (reportClocks) => {
      if (state.phase !== 'open') {
        return
      }
      state = { ...state, reportClocks, snapshotVersion: nextSnapshotVersion() }
    },

    recordInboundMessage: ({ size, at }) => {
      recordMessage(snapshot.inbound, lastInboundMessageAt, size, at.relative)
      lastInboundMessageAt = at.relative
    },

    recordOutboundMessage: ({ size, bufferedAmountPreSend, at }) => {
      // the peak is counted after the payload is enqueued, from the pre-send queue depth:
      // `send()` grows the queue by exactly the payload size, whereas reading the socket again
      // could catch a queue the browser has already partly flushed and understate the peak
      snapshot.bufferedAmountMax = Math.max(snapshot.bufferedAmountMax, bufferedAmountPreSend + size)
      recordMessage(snapshot.outbound, lastOutboundMessageAt, size, at.relative)
      lastOutboundMessageAt = at.relative
    },

    recordClosing: ({ at }) => {
      state = { id, connectingClocks, phase: 'closing', closingClocks: at }
    },

    recordClose: ({ at, code, reason, wasClean }) => {
      endTracking(at, WebSocketTrackingEndReason.CLOSE_EVENT, { code, reason, wasClean })
    },

    recordTrackingEnd: (endClocks, trackingEndReason) => {
      endTracking(endClocks, trackingEndReason)
    },
  }
}

/**
 * The constructor takes either a single protocol or a list of them; a connection that requested
 * none reports nothing rather than an empty list.
 */
function toRequestedProtocols(protocols: string | string[] | undefined) {
  const requestedProtocols = typeof protocols === 'string' ? [protocols] : protocols
  return requestedProtocols && requestedProtocols.length > 0 ? requestedProtocols : undefined
}

function sanitizeWebSocketUrl(url: string) {
  const sanitizedUrl = buildUrl(url)
  sanitizedUrl.search = ''
  return sanitizedUrl.href
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

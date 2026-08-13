import type { BufferedData, Observable, TimeoutId, WebSocketContext } from '@datadog/browser-core'
import {
  BufferedDataType,
  clearInterval,
  ExperimentalFeature,
  generateUUID,
  isExperimentalFeatureEnabled,
  noop,
  setInterval,
} from '@datadog/browser-core'
import type { ClocksState } from '@datadog/js-core/time'
import { clocksNow, ONE_MINUTE } from '@datadog/js-core/time'
import { buildUrl } from '@datadog/js-core/util'
import type { RawRumWebSocketVitalEvent } from '../../rawRumEvent.types'
import { WebSocketTrackingEndReason } from '../../rawRumEvent.types'
import type { RumConfiguration } from '../configuration'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { TrackedConnection } from './trackedConnection'
import { createTrackedConnection } from './trackedConnection'
import type { WebSocketTrackingEnd, WebSocketVitalPhaseInfo } from './serializeWebSocketVital'
import { serializeWebSocketVital, webSocketVitalClocks } from './serializeWebSocketVital'

/** The seam every WebSocket vital reaches the event pipeline through. */
export type AddWebSocketVital = (rawRumEvent: RawRumWebSocketVitalEvent, startClocks: ClocksState) => void

/**
 * How often an open connection reports where it is. One flat cadence in every page state: 60 s is
 * also the rate Chrome throttles a hidden tab's chained timers to, so the nominal and the throttled
 * cadence coincide and there is one regime to reason about.
 *
 * A module constant rather than a configuration option, because it has to agree with the silence
 * threshold the reducer synthesises a close after — no page can know that number. It is meant to be
 * cheap to change, since it will be tuned against what RC1 collects.
 */
export const WEBSOCKET_HEARTBEAT_INTERVAL = ONE_MINUTE

export interface WebSocketConnectionTracker {
  /** One beat of every connection in phase `open`, whether the cadence or a page transition asked. */
  beatOpenConnections: () => void
  flushOpenConnections: (endClocks?: ClocksState) => void
  stop: () => void
}

/**
 * The opt-in is enforced here rather than by withholding instrumentation, which happens from SDK
 * load (see `startBufferingData`). When it is closed, nothing is subscribed nor allocated and the
 * returned stop handle is a no-op.
 */
export function startWebSocketCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  addWebSocketVital: AddWebSocketVital,
  bufferedDataObservable: Observable<BufferedData>
) {
  if (!isWebSocketCollectionEnabled(configuration)) {
    return { stop: noop }
  }

  const tracker = trackWebSocket(bufferedDataObservable, addWebSocketVital)

  // Session-boundary cleanup happens on SESSION_EXPIRED (fired before SESSION_RENEWED). Open
  // connections are finalized once; later events on the same WebSocket instance are ignored.
  const sessionExpiredSubscription = lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, ({ endClocks }) => {
    tracker.flushOpenConnections(endClocks)
  })

  // A beat on all three reasons, unlike view tracking, which filters to before-unload: a view
  // survives a background transition, a connection may not, and hidden is the only signal mobile
  // browsers guarantee at that point. It is what keeps a backgrounded app's reported traffic from
  // being stale by however long the app sat in the background.
  const prepareUrgentFlushSubscription = lifeCycle.subscribe(LifeCycleEventType.PREPARE_URGENT_FLUSH, () => {
    tracker.beatOpenConnections()
  })

  return {
    stop: () => {
      sessionExpiredSubscription.unsubscribe()
      prepareUrgentFlushSubscription.unsubscribe()
      tracker.flushOpenConnections()
      tracker.stop()
    },
  }
}

function isWebSocketCollectionEnabled(configuration: RumConfiguration) {
  return (
    configuration.trackResources &&
    (configuration.betaTrackWebSockets || isExperimentalFeatureEnabled(ExperimentalFeature.TRACK_WEBSOCKETS))
  )
}

export function trackWebSocket(
  bufferedDataObservable: Observable<BufferedData>,
  addWebSocketVital: AddWebSocketVital
): WebSocketConnectionTracker {
  const trackedConnections = new Map<WebSocket, TrackedConnection>()
  let heartbeatIntervalId: TimeoutId | undefined

  /**
   * Reports one phase of one connection. The state is read at the moment of emission, so a
   * snapshot-carrying phase must have recorded whatever it observed before getting here.
   */
  function emitVital(connection: TrackedConnection, phaseInfo: WebSocketVitalPhaseInfo) {
    const state = connection.getState()
    addWebSocketVital(serializeWebSocketVital(state, phaseInfo), webSocketVitalClocks(state, phaseInfo))
  }

  /**
   * Ends tracking, whichever terminal came first, and reports the connection's last vital. The
   * snapshot version continues the sequence the open vitals started, so this is the highest one the
   * connection reports.
   */
  function endTracking(
    connection: TrackedConnection,
    endClocks: ClocksState,
    bufferedAmount: number,
    trackingEnd: WebSocketTrackingEnd
  ) {
    connection.recordTrackingEnd(endClocks, bufferedAmount)
    emitVital(connection, {
      phase: 'closed',
      endClocks,
      snapshotVersion: connection.nextSnapshotVersion(),
      ...trackingEnd,
    })
  }

  /**
   * One beat: every connection in phase `open` reports where it is, at one date and each with the
   * next version of its own snapshot. A connection in any other phase does not beat — the closing
   * phase deliberately included, so that a hung close falls silent instead of looking alive.
   */
  function beatOpenConnections() {
    const beatClocks = clocksNow()

    trackedConnections.forEach((connection) => {
      const state = connection.getState()
      // the open clocks are read from the connection rather than asserted: the phase implies them,
      // and only checking for both tells the compiler so
      if (state.phase !== 'open' || !state.openClocks) {
        return
      }

      emitVital(connection, {
        phase: 'open',
        openClocks: state.openClocks,
        beatClocks,
        snapshotVersion: connection.nextSnapshotVersion(),
      })
    })
  }

  /**
   * Follows the timer to the population in phase `open`, so the heartbeat costs nothing while no
   * connection is open.
   */
  function syncHeartbeat() {
    const shouldBeat = hasOpenConnection()

    if (shouldBeat && heartbeatIntervalId === undefined) {
      heartbeatIntervalId = setInterval(beatOpenConnections, WEBSOCKET_HEARTBEAT_INTERVAL)
    } else if (!shouldBeat && heartbeatIntervalId !== undefined) {
      clearInterval(heartbeatIntervalId)
      heartbeatIntervalId = undefined
    }
  }

  function hasOpenConnection() {
    for (const connection of trackedConnections.values()) {
      if (connection.getState().phase === 'open') {
        return true
      }
    }
    return false
  }

  const subscription = bufferedDataObservable.subscribe((bufferedData) => {
    if (bufferedData.type !== BufferedDataType.WEB_SOCKET) {
      return
    }

    const context = bufferedData.data
    handleWebSocketContext(context)

    // after every phase change rather than at the ones that happen to matter, so none can be missed.
    // Messages are the one hot path here and change no phase, so they are the exception
    if (context.state !== 'message-in' && context.state !== 'message-out') {
      syncHeartbeat()
    }
  })

  function handleWebSocketContext(context: WebSocketContext) {
    switch (context.state) {
      case 'connecting': {
        const connection = createTrackedConnection({
          id: generateUUID(),
          url: sanitizeWebSocketUrl(context.url),
          requestedProtocols: toRequestedProtocols(context.protocols),
          connectingClocks: context.startClocks,
        })
        trackedConnections.set(context.instance, connection)

        emitVital(connection, { phase: 'connecting' })

        return
      }

      case 'open': {
        const connection = trackedConnections.get(context.instance)
        if (!connection) {
          return
        }

        connection.recordOpen({
          openClocks: context.openClocks,
          // the DOM reports "the server negotiated none" as an empty string
          selectedProtocol: context.protocol || undefined,
          selectedExtensions: context.extensions,
        })

        emitVital(connection, {
          phase: 'open',
          openClocks: context.openClocks,
          // the first vital of the sequence is taken when the handshake completed; the heartbeat's
          // later beats are the ones where the two dates part
          beatClocks: context.openClocks,
          snapshotVersion: connection.nextSnapshotVersion(),
        })

        return
      }

      case 'message-in': {
        trackedConnections.get(context.instance)?.recordInboundMessage(context.size, context.at.timeStamp)

        return
      }

      case 'message-out': {
        trackedConnections
          .get(context.instance)
          ?.recordOutboundMessage(context.size, context.bufferedAmountPreSend, context.at.timeStamp)

        return
      }

      // reported at most once per connection, which the observable's `readyState` guard is what
      // enforces
      case 'closing': {
        const connection = trackedConnections.get(context.instance)
        if (!connection) {
          return
        }

        connection.recordClosing(context.at)

        emitVital(connection, { phase: 'closing', closingClocks: context.at })

        return
      }

      case 'closed': {
        const connection = trackedConnections.get(context.instance)
        if (!connection) {
          return
        }

        trackedConnections.delete(context.instance)

        endTracking(connection, context.at, context.bufferedAmountAtClose, {
          trackingEndReason: WebSocketTrackingEndReason.CLOSE_EVENT,
          closeEvent: { code: context.code, reason: context.reason, wasClean: context.wasClean },
        })

        return
      }
    }
  }

  return {
    beatOpenConnections,
    flushOpenConnections: (endClocks = clocksNow()) => {
      trackedConnections.forEach((connection, instance) => {
        // no close event happened on this path, so the send queue depth is read from the socket and
        // the close outcome is genuinely absent rather than defaulted
        endTracking(connection, endClocks, instance.bufferedAmount, {
          trackingEndReason: WebSocketTrackingEndReason.SESSION_END,
        })
      })

      trackedConnections.clear()
      syncHeartbeat()
    },
    stop: () => {
      subscription.unsubscribe()
      trackedConnections.clear()
      syncHeartbeat()
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

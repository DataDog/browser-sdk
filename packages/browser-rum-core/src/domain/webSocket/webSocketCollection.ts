import type { Observable, TimeoutId, WebSocketContext } from '@datadog/browser-core'
import {
  addEventListener,
  clearInterval,
  DOM_EVENT,
  ExperimentalFeature,
  generateUUID,
  initWebSocketObservable,
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
import type { WebSocketTrackingEnd, WebSocketVitalPhaseInfo } from './serializeWebSocketVital'
import { serializeWebSocketVital, webSocketVitalClocks } from './serializeWebSocketVital'
import type { TrackedConnection } from './trackedConnection'
import { createTrackedConnection } from './trackedConnection'

/** The seam every WebSocket vital reaches the event pipeline through. */
export type AddWebSocketVital = (rawRumEvent: RawRumWebSocketVitalEvent, startClocks: ClocksState) => void

/**
 * A one flat cadence in every page state that tells how often an open connection reports where it is.
 *
 * It has to be a module constant rather than a configuration option, because it has to agree with
 * the silence threshold the reducer synthesises a close after.
 *
 * 60s is the rate Chrome throttles a hidden tab's chained timers to,
 * so it's the nominal value for the heartbeat interval.
 *
 * It is meant to be cheap to change, we might tune it after collecting data.
 */
export const WEBSOCKET_HEARTBEAT_INTERVAL = ONE_MINUTE

/** A reason tracking ends for without the SDK observing any close event. */
type UnobservedTrackingEndReason = Exclude<WebSocketTrackingEndReason, typeof WebSocketTrackingEndReason.CLOSE_EVENT>

export interface WebSocketConnectionTracker {
  /** One beat of every connection in phase `open`, whether the cadence or a page transition asked. */
  beatOpenConnections: () => void
  /** Ends tracking of every tracked connection, and tells how many there were. */
  flushOpenConnections: (endClocks?: ClocksState, trackingEndReason?: UnobservedTrackingEndReason) => number
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
  pageUnloadFlushObservable: Observable<void>
) {
  if (!isWebSocketCollectionEnabled(configuration)) {
    return { stop: noop }
  }

  const tracker = trackWebSocket(initWebSocketObservable(), addWebSocketVital)

  // Session-boundary cleanup happens on SESSION_EXPIRED (fired before SESSION_RENEWED). Open
  // connections are finalized once; later events on the same WebSocket instance are ignored.
  const sessionExpiredSubscription = lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, ({ endClocks }) => {
    tracker.flushOpenConnections(endClocks)
  })

  // A beat on all three reasons to collect fresh data when the connections is likely to be
  // terminated without a proper close event.
  const prepareUrgentFlushSubscription = lifeCycle.subscribe(LifeCycleEventType.PREPARE_URGENT_FLUSH, () => {
    tracker.beatOpenConnections()
  })

  // A listener of its own rather than a page exit reason: Session Replay stores that reason as a
  // segment creation reason, whose schema has no `page_hide` member.
  const { stop: stopPageHideListener } = addEventListener(window, DOM_EVENT.PAGE_HIDE, (event) => {
    // the connection may survive in the back/forward cache, so it is left to speak for itself
    if ((event as PageTransitionEvent).persisted) {
      return
    }
    // the page may already be hidden, so no exit flush is coming to send what was just reported
    if (tracker.flushOpenConnections(clocksNow(), WebSocketTrackingEndReason.PAGE_UNLOADED) > 0) {
      pageUnloadFlushObservable.notify()
    }
  })

  return {
    stop: () => {
      sessionExpiredSubscription.unsubscribe()
      prepareUrgentFlushSubscription.unsubscribe()
      stopPageHideListener()
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
  webSocketContextObservable: Observable<WebSocketContext>,
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

  function hasOpenConnection() {
    for (const connection of trackedConnections.values()) {
      if (connection.getState().phase === 'open') {
        return true
      }
    }
    return false
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
          // These are reported as empty strings when none were specified
          selectedProtocol: context.protocol || undefined,
          selectedExtensions: context.extensions || undefined,
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

  const subscription = webSocketContextObservable.subscribe((context) => {
    handleWebSocketContext(context)

    // after every phase change rather than at the ones that happen to matter, so none can be missed.
    // Messages are the one hot path here and change no phase, so they are the exception
    if (context.state !== 'message-in' && context.state !== 'message-out') {
      syncHeartbeat()
    }
  })

  return {
    beatOpenConnections,
    flushOpenConnections: (endClocks = clocksNow(), trackingEndReason = WebSocketTrackingEndReason.SESSION_END) => {
      const endedCount = trackedConnections.size
      trackedConnections.forEach((connection, instance) => {
        // no close event happened on this path, so the send queue depth is read from the socket and
        // the close outcome is genuinely absent rather than defaulted
        endTracking(connection, endClocks, instance.bufferedAmount, { trackingEndReason })
      })

      trackedConnections.clear()
      syncHeartbeat()
      return endedCount
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

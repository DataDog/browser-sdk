import type { BufferedData, Observable } from '@datadog/browser-core'
import {
  BufferedDataType,
  ExperimentalFeature,
  generateUUID,
  isExperimentalFeatureEnabled,
  noop,
} from '@datadog/browser-core'
import type { ClocksState } from '@datadog/js-core/time'
import { clocksNow } from '@datadog/js-core/time'
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

export interface WebSocketConnectionTracker {
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

  return {
    stop: () => {
      sessionExpiredSubscription.unsubscribe()
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

  const subscription = bufferedDataObservable.subscribe((bufferedData) => {
    if (bufferedData.type !== BufferedDataType.WEB_SOCKET) {
      return
    }

    const context = bufferedData.data
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
  })

  return {
    flushOpenConnections: (endClocks = clocksNow()) => {
      trackedConnections.forEach((connection, instance) => {
        // no close event happened on this path, so the send queue depth is read from the socket and
        // the close outcome is genuinely absent rather than defaulted
        endTracking(connection, endClocks, instance.bufferedAmount, {
          trackingEndReason: WebSocketTrackingEndReason.SESSION_END,
        })
      })

      trackedConnections.clear()
    },
    stop: () => {
      subscription.unsubscribe()
      trackedConnections.clear()
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

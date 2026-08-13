import type { BufferedData, Observable } from '@datadog/browser-core'
import {
  BufferedDataType,
  ExperimentalFeature,
  generateUUID,
  isExperimentalFeatureEnabled,
  noop,
  sanitize,
} from '@datadog/browser-core'
import type { ClocksState, Duration } from '@datadog/js-core/time'
import { clocksNow } from '@datadog/js-core/time'
import { buildUrl } from '@datadog/js-core/util'
import { VitalType } from '../../rawRumEvent.types'
import type { RumConfiguration } from '../configuration'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { DurationVital } from '../vital/vitalCollection'
import type { TrackedConnection } from './trackedConnection'
import { createTrackedConnection } from './trackedConnection'

export const WEBSOCKET_CONNECTING_VITAL_NAME = 'websocket-connecting'
export const WEBSOCKET_CLOSED_VITAL_NAME = 'websocket-closed'

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
  addDurationVital: (vital: DurationVital) => void,
  bufferedDataObservable: Observable<BufferedData>
) {
  if (!isWebSocketCollectionEnabled(configuration)) {
    return { stop: noop }
  }

  const tracker = trackWebSocket(bufferedDataObservable, addDurationVital)

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
  addDurationVital: (vital: DurationVital) => void
): WebSocketConnectionTracker {
  const trackedConnections = new Map<WebSocket, TrackedConnection>()

  function emitVital(name: string, connection: TrackedConnection, startClocks: ClocksState) {
    const { id, url } = connection.getState()

    addDurationVital({
      id: generateUUID(),
      name,
      type: VitalType.DURATION,
      startClocks,
      duration: 0 as Duration,
      context: sanitize({
        url,
        connection_id: id,
      }),
    })
  }

  function endTracking(connection: TrackedConnection, endClocks: ClocksState, bufferedAmount: number) {
    connection.recordTrackingEnd(endClocks, bufferedAmount)
    emitVital(WEBSOCKET_CLOSED_VITAL_NAME, connection, endClocks)
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

        emitVital(WEBSOCKET_CONNECTING_VITAL_NAME, connection, context.startClocks)

        return
      }

      case 'open': {
        trackedConnections.get(context.instance)?.recordOpen({
          openClocks: context.openClocks,
          // the DOM reports "the server negotiated none" as an empty string
          selectedProtocol: context.protocol || undefined,
          selectedExtensions: context.extensions,
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

        endTracking(connection, context.at, context.bufferedAmountAtClose)

        return
      }
    }
  })

  return {
    flushOpenConnections: (endClocks = clocksNow()) => {
      trackedConnections.forEach((connection, instance) => {
        // no close event happened on this path, so the send queue depth is read from the socket
        endTracking(connection, endClocks, instance.bufferedAmount)
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

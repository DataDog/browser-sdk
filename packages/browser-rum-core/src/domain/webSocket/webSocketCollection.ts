import type { Observable } from '@datadog/browser-core'
import { ExperimentalFeature, isExperimentalFeatureEnabled, noop } from '@datadog/browser-core'
import type { ClocksState } from '@datadog/js-core/time'
import { clocksNow } from '@datadog/js-core/time'
import type { WebSocketContext } from '../../browser/webSocketObservable'
import { initWebSocketObservable } from '../../browser/webSocketObservable'
import { WebSocketTrackingEndReason } from '../../rawRumEvent.types'
import type { RumConfiguration } from '../configuration'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { serializeWebSocketVital, getPhaseClocks } from './serializeWebSocketVital'
import type { TrackedConnection } from './trackedConnection'
import { createTrackedConnection } from './trackedConnection'

/** A reason tracking ends for without the SDK observing any close event. */
export type UnobservedTrackingEndReason = Exclude<
  WebSocketTrackingEndReason,
  typeof WebSocketTrackingEndReason.CLOSE_EVENT
>

export interface WebSocketConnectionTracker {
  /** Ends tracking of every tracked connection, and tells how many there were. */
  flushOpenConnections: (endClocks?: ClocksState, trackingEndReason?: UnobservedTrackingEndReason) => number
  stop: () => void
}

/**
 * The opt-in is enforced here rather than by withholding instrumentation, which happens from SDK
 * load (see `startBufferingData`). When it is closed, nothing is subscribed nor allocated and the
 * returned stop handle is a no-op.
 */
export function startWebSocketCollection(lifeCycle: LifeCycle, configuration: RumConfiguration) {
  if (!isWebSocketCollectionEnabled(configuration)) {
    return { stop: noop }
  }

  const tracker = trackWebSocket(lifeCycle, initWebSocketObservable())

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
  lifeCycle: LifeCycle,
  webSocketContextObservable: Observable<WebSocketContext>
): WebSocketConnectionTracker {
  const trackedConnections = new Map<WebSocket, TrackedConnection>()

  /**
   * Reports one phase of one connection. The connection already holds the phase clocks and snapshot
   * version the vital needs.
   *
   * Emitted straight onto the life cycle rather than through vitalCollection: a WebSocket vital is
   * an instant, zero-duration event, so the duration-vital frozen-page guard has nothing to reject.
   */
  function emitVital(instance: WebSocket, connection: TrackedConnection) {
    const state = connection.getState()
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      rawRumEvent: serializeWebSocketVital(state),
      startClocks: getPhaseClocks(state),
      domainContext: { webSocket: instance },
    })
  }

  function handleWebSocketContext(context: WebSocketContext) {
    switch (context.state) {
      case 'connecting': {
        const connection = createTrackedConnection(context)
        trackedConnections.set(context.instance, connection)

        emitVital(context.instance, connection)

        return
      }

      case 'open': {
        const connection = trackedConnections.get(context.instance)
        if (!connection) {
          return
        }

        connection.recordOpen(context)

        emitVital(context.instance, connection)

        return
      }

      case 'message-in': {
        trackedConnections.get(context.instance)?.recordInboundMessage(context)

        return
      }

      case 'message-out': {
        trackedConnections.get(context.instance)?.recordOutboundMessage(context)

        return
      }

      case 'closed': {
        const connection = trackedConnections.get(context.instance)
        if (!connection) {
          return
        }

        trackedConnections.delete(context.instance)

        connection.recordClose(context)
        emitVital(context.instance, connection)

        return
      }
    }
  }

  const subscription = webSocketContextObservable.subscribe(handleWebSocketContext)

  return {
    flushOpenConnections: (endClocks = clocksNow(), trackingEndReason = WebSocketTrackingEndReason.SESSION_END) => {
      const endedCount = trackedConnections.size
      trackedConnections.forEach((connection, instance) => {
        // no close event happened on this path, so the close outcome is genuinely absent rather
        // than defaulted
        connection.recordTrackingEnd(endClocks, trackingEndReason)
        emitVital(instance, connection)
      })

      trackedConnections.clear()
      return endedCount
    },
    stop: () => {
      subscription.unsubscribe()
      trackedConnections.clear()
    },
  }
}

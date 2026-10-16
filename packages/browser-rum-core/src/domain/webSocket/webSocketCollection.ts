import { ExperimentalFeature, isExperimentalFeatureEnabled, PageExitReason } from '@datadog/browser-core'
import type { Observable, TimeoutId } from '@datadog/js-core/util'
import { clearInterval, noop, setInterval } from '@datadog/js-core/util'
import type { ClocksState } from '@datadog/js-core/time'
import { clocksNow, ONE_MINUTE } from '@datadog/js-core/time'
import type { WebSocketContext } from '../../browser/webSocketObservable'
import { initWebSocketObservable } from '../../browser/webSocketObservable'
import { WebSocketTrackingEndReason } from '../../rawRumEvent.types'
import type { RumConfiguration } from '../configuration'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { serializeWebSocketVital, getPhaseClocks } from './serializeWebSocketVital'
import type { TrackedConnection } from './trackedConnection'
import { createTrackedConnection } from './trackedConnection'
import { hasOpenConnection, trackedConnections } from './trackedConnections'

/**
 * A one flat cadence in every page state that tells how often an open connection reports where it is.
 *
 * It has to be a module constant rather than a configuration option, because it has to agree with
 * the silence threshold the reducer synthesises a close after.
 *
 * 60s is the rate Chrome throttles a hidden tab's chained timers to,
 * so it's the nominal value for the periodic report interval.
 *
 * It is meant to be cheap to change, we might tune it after collecting data.
 */
export const WEBSOCKET_PERIODIC_REPORT_INTERVAL = ONE_MINUTE

/** A reason tracking ends for without the SDK observing any close event. */
export type UnobservedTrackingEndReason = Exclude<
  WebSocketTrackingEndReason,
  typeof WebSocketTrackingEndReason.CLOSE_EVENT
>

export interface WebSocketConnectionTracker {
  /** Report every connection in phase `open`, whether the cadence or a page transition asked. */
  reportOpenConnections: () => void
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

  const tracker = trackWebSocket(initWebSocketObservable(), emitVital)

  // Session-boundary cleanup happens on SESSION_EXPIRED (fired before SESSION_RENEWED). Open
  // connections are finalized once; later events on the same WebSocket instance are ignored.
  const sessionExpiredSubscription = lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, ({ endClocks }) => {
    tracker.flushOpenConnections(endClocks)
  })

  const prepareUrgentFlushSubscription = lifeCycle.subscribe(LifeCycleEventType.PREPARE_URGENT_FLUSH, (reason) => {
    if (reason === PageExitReason.PAGE_TERMINATED) {
      // Page is going away.
      tracker.flushOpenConnections(clocksNow(), WebSocketTrackingEndReason.PAGE_TERMINATED)
    } else {
      tracker.reportOpenConnections()
    }
  })

  /**
   * Reports one phase of one connection. The connection already holds the phase clocks and snapshot
   * version the vital needs; open reports must be written with `recordReport` first so the
   * snapshot freezes at the vital's date.
   *
   * Emitted straight onto the life cycle rather than through vitalCollection: a WebSocket vital is
   * an instant, zero-duration event, so the duration-vital frozen-page guard has nothing to reject —
   * and rejecting one would let a frozen page suppress the periodic report built to detect it.
   */
  function emitVital(instance: WebSocket, connection: TrackedConnection) {
    const state = connection.getState()
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      rawRumEvent: serializeWebSocketVital(state),
      startClocks: getPhaseClocks(state),
      domainContext: { webSocket: instance },
    })
    return true
  }

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
  webSocketContextObservable: Observable<WebSocketContext>,
  emitVital: (instance: WebSocket, connection: TrackedConnection) => boolean
): WebSocketConnectionTracker {
  let reportIntervalId: TimeoutId | undefined

  /**
   * One report: every connection in phase `open` reports where it is, at one date and each with the
   * next version of its own snapshot. A connection in any other phase does not emit a report — the
   * closing phase deliberately included, so that a hung close falls silent instead of looking alive.
   */
  function reportOpenConnections() {
    const reportClocks = clocksNow()

    trackedConnections.forEach((connection, instance) => {
      if (!connection.isOpen()) {
        return
      }

      connection.recordReport(reportClocks)
      emitVital(instance, connection)
    })
  }

  function startOpenConnectionsPeriodicReport() {
    if (reportIntervalId !== undefined) {
      return
    }

    reportIntervalId = setInterval(reportOpenConnections, WEBSOCKET_PERIODIC_REPORT_INTERVAL)
  }

  function stopOpenConnectionsPeriodicReport() {
    clearInterval(reportIntervalId)
    reportIntervalId = undefined
  }

  const subscription = webSocketContextObservable.subscribe((context) => {
    handleWebSocketContext(context, emitVital)

    // After key phase transitions to keep the report only when there's an active pool
    // of WebSockets.
    if (context.state !== 'message-in' && context.state !== 'message-out') {
      if (hasOpenConnection()) {
        startOpenConnectionsPeriodicReport()
      } else {
        stopOpenConnectionsPeriodicReport()
      }
    }
  })

  return {
    reportOpenConnections,
    flushOpenConnections: (endClocks = clocksNow(), trackingEndReason = WebSocketTrackingEndReason.SESSION_END) => {
      const endedCount = trackedConnections.size
      trackedConnections.forEach((connection, instance) => {
        // No close event, so the send queue depth is read from the socket
        connection.recordTrackingEnd(endClocks, trackingEndReason, instance.bufferedAmount)
        emitVital(instance, connection)
      })

      trackedConnections.clear()
      stopOpenConnectionsPeriodicReport()
      return endedCount
    },
    stop: () => {
      subscription.unsubscribe()
      trackedConnections.clear()
      stopOpenConnectionsPeriodicReport()
    },
  }
}

/**
 * On the connecting phase, the callback tells whether the connection should be tracked: when it
 * returns false, the connection is forgotten and its later events are ignored.
 */
function handleWebSocketContext(
  context: WebSocketContext,
  callback: (instance: WebSocket, connection: TrackedConnection) => boolean
) {
  let keepTracking = true

  switch (context.state) {
    case 'connecting': {
      const connection = createTrackedConnection(context)
      trackedConnections.set(context.instance, connection)

      keepTracking = callback(context.instance, connection)

      break
    }

    case 'open': {
      const connection = trackedConnections.get(context.instance)
      if (!connection) {
        break
      }

      connection.recordOpen(context)

      callback(context.instance, connection)

      break
    }

    case 'message-in': {
      trackedConnections.get(context.instance)?.recordInboundMessage(context)

      break
    }

    case 'message-out': {
      trackedConnections.get(context.instance)?.recordOutboundMessage(context)

      break
    }

    case 'closing': {
      const connection = trackedConnections.get(context.instance)
      if (!connection) {
        break
      }

      connection.recordClosing(context)

      callback(context.instance, connection)

      break
    }

    case 'closed': {
      const connection = trackedConnections.get(context.instance)
      if (!connection) {
        break
      }

      trackedConnections.delete(context.instance)

      connection.recordClose(context)
      callback(context.instance, connection)

      break
    }
  }

  if (!keepTracking) {
    trackedConnections.delete(context.instance)
  }
}

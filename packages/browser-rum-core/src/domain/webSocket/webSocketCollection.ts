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
import { emitWebSocketVital } from './emitWebSocketVital'
import type { TrackedConnection } from './trackedConnection'
import { createTrackedConnection } from './trackedConnection'

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

export const trackedConnectionsMap = new Map<WebSocket, TrackedConnection>()

function hasOpenConnection() {
  for (const connection of trackedConnectionsMap.values()) {
    if (connection.isOpen()) {
      return true
    }
  }
  return false
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

  function emitVital(instance: WebSocket, connection: TrackedConnection) {
    emitWebSocketVital(lifeCycle, instance, connection.getState())
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
  emitVital: (instance: WebSocket, connection: TrackedConnection) => void
): WebSocketConnectionTracker {
  let reportIntervalId: TimeoutId | undefined

  /**
   * One report: every connection in phase `open` reports where it is, at one date and each with the
   * next version of its own snapshot. A connection in any other phase does not emit a report — the
   * closing phase deliberately included, so that a hung close falls silent instead of looking alive.
   */
  function reportOpenConnections() {
    const reportClocks = clocksNow()

    trackedConnectionsMap.forEach((connection, instance) => {
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
      const endedCount = trackedConnectionsMap.size
      trackedConnectionsMap.forEach((connection, instance) => {
        // No close event, so the send queue depth is read from the socket
        connection.recordTrackingEnd(endClocks, trackingEndReason, instance.bufferedAmount)
        emitVital(instance, connection)
      })

      trackedConnectionsMap.clear()
      stopOpenConnectionsPeriodicReport()
      return endedCount
    },
    stop: () => {
      subscription.unsubscribe()
      trackedConnectionsMap.clear()
      stopOpenConnectionsPeriodicReport()
    },
  }
}

function handleWebSocketContext(
  context: WebSocketContext,
  callback: (instance: WebSocket, connection: TrackedConnection) => void
) {
  switch (context.state) {
    case 'connecting': {
      const connection = createTrackedConnection(context)
      trackedConnectionsMap.set(context.instance, connection)

      callback(context.instance, connection)

      return
    }

    case 'open': {
      const connection = trackedConnectionsMap.get(context.instance)
      if (!connection) {
        return
      }

      connection.recordOpen(context)

      callback(context.instance, connection)

      return
    }

    case 'message-in': {
      trackedConnectionsMap.get(context.instance)?.recordInboundMessage(context)

      return
    }

    case 'message-out': {
      trackedConnectionsMap.get(context.instance)?.recordOutboundMessage(context)

      return
    }

    case 'closing': {
      const connection = trackedConnectionsMap.get(context.instance)
      if (!connection) {
        return
      }

      connection.recordClosing(context)

      callback(context.instance, connection)

      return
    }

    case 'closed': {
      const connection = trackedConnectionsMap.get(context.instance)
      if (!connection) {
        return
      }

      trackedConnectionsMap.delete(context.instance)

      connection.recordClose(context)
      callback(context.instance, connection)

      return
    }
  }
}

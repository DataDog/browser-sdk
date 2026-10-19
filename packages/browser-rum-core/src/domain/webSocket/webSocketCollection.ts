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
import { emitWebSocketVital } from './emitWebSocketVital'
import type { TrackedConnection } from './trackedConnection'
import { createTrackedConnection } from './trackedConnection'
import type { EarlyConnectionsBuffer } from './earlyConnectionsBuffer'
import { createEarlyConnectionsBuffer } from './earlyConnectionsBuffer'

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

const trackedConnections = new Map<WebSocket, TrackedConnection>()

function hasOpenConnection() {
  for (const connection of trackedConnections.values()) {
    if (connection.isOpen()) {
      return true
    }
  }
  return false
}

export interface EarlyWebSocketCollection {
  /** The phases of the connections opened before the collection started, drained once it starts. */
  buffer: EarlyConnectionsBuffer
  /** Stops observing WebSockets and empties the buffer. */
  stop: () => void
}

export function startEarlyWebSocketCollection(): EarlyWebSocketCollection {
  const buffer = createEarlyConnectionsBuffer()

  const subscription = initWebSocketObservable().subscribe((context) => {
    handleWebSocketContext(context, buffer.register)
  })

  return {
    buffer,
    stop: () => {
      subscription.unsubscribe()
      buffer.clear()
    },
  }
}

/**
 * The opt-in is enforced here rather than by withholding instrumentation, which happens from SDK
 * load (see `startEarlyWebSocketCollection`). When the collection is opted-out, the early
 * collection is stopped and the connections it tracked are forgotten, the returned handle is a noop.
 */
export function startWebSocketCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  earlyWebSocketCollection: EarlyWebSocketCollection
) {
  if (!isWebSocketCollectionEnabled(configuration)) {
    earlyWebSocketCollection.stop()

    trackedConnections.clear()
    return { stop: noop }
  }

  earlyWebSocketCollection.buffer.drain(lifeCycle)

  const tracker = trackWebSocket(initWebSocketObservable(), (instance, connection) => {
    emitWebSocketVital(lifeCycle, instance, connection.getState())
    return true
  })
  // Stopped only once the tracker is subscribed: the observable keeps an observer, so the
  // instrumentation installed at SDK load stays in place for code that kept the constructor.
  earlyWebSocketCollection.stop()

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
  onConnectionUpdate: (instance: WebSocket, connection: TrackedConnection) => boolean
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
      onConnectionUpdate(instance, connection)
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
    handleWebSocketContext(context, onConnectionUpdate)

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

  // Connections opened before init are already open when tracking starts
  if (hasOpenConnection()) {
    reportOpenConnections()
    startOpenConnectionsPeriodicReport()
  }

  return {
    reportOpenConnections,
    flushOpenConnections: (endClocks = clocksNow(), trackingEndReason = WebSocketTrackingEndReason.SESSION_END) => {
      const endedCount = trackedConnections.size
      trackedConnections.forEach((connection, instance) => {
        // No close event, so the send queue depth is read from the socket
        connection.recordTrackingEnd(endClocks, trackingEndReason, instance.bufferedAmount)
        onConnectionUpdate(instance, connection)
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
 * Records a WebSocket context on its tracked connection, then hands the connection to
 * `onConnectionUpdate` each time it enters a new phase (connecting, open, closing, closed), so the
 * caller can report that phase: emit it as a vital, or buffer it until the collection starts.
 *
 * Messages are not phases: they only add to the connection's snapshot, which reaches the caller
 * with the next open report or the closed vital. Calling `onConnectionUpdate` on each message
 * would report one vital per message.
 *
 * On the connecting phase, `onConnectionUpdate` also tells whether the connection should be
 * tracked: when it returns false, the connection is forgotten and its later events are ignored.
 */
function handleWebSocketContext(
  context: WebSocketContext,
  onConnectionUpdate: (instance: WebSocket, connection: TrackedConnection) => boolean
) {
  let keepTracking = true

  switch (context.state) {
    case 'connecting': {
      const connection = createTrackedConnection(context)
      trackedConnections.set(context.instance, connection)

      keepTracking = onConnectionUpdate(context.instance, connection)

      break
    }

    case 'open': {
      const connection = trackedConnections.get(context.instance)
      if (!connection) {
        break
      }

      connection.recordOpen(context)

      onConnectionUpdate(context.instance, connection)

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

      onConnectionUpdate(context.instance, connection)

      break
    }

    case 'closed': {
      const connection = trackedConnections.get(context.instance)
      if (!connection) {
        break
      }

      trackedConnections.delete(context.instance)

      connection.recordClose(context)
      onConnectionUpdate(context.instance, connection)

      break
    }
  }

  if (!keepTracking) {
    trackedConnections.delete(context.instance)
  }
}

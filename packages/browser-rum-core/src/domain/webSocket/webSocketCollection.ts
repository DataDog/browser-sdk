import type { Observable, TimeoutId } from '@datadog/browser-core'
import {
  clearInterval,
  ExperimentalFeature,
  isExperimentalFeatureEnabled,
  noop,
  setInterval,
} from '@datadog/browser-core'
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

  const tracker = trackWebSocket(lifeCycle, initWebSocketObservable())

  // Session-boundary cleanup happens on SESSION_EXPIRED (fired before SESSION_RENEWED). Open
  // connections are finalized once; later events on the same WebSocket instance are ignored.
  const sessionExpiredSubscription = lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, ({ endClocks }) => {
    tracker.flushOpenConnections(endClocks)
  })

  // A page transition may be the last chance to report before the page is frozen or goes away, so
  // open connections are reported without waiting for the next periodic report.
  const prepareUrgentFlushSubscription = lifeCycle.subscribe(LifeCycleEventType.PREPARE_URGENT_FLUSH, () => {
    tracker.reportOpenConnections()
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
  lifeCycle: LifeCycle,
  webSocketContextObservable: Observable<WebSocketContext>
): WebSocketConnectionTracker {
  const trackedConnections = new Map<WebSocket, TrackedConnection>()
  let reportIntervalId: TimeoutId | undefined

  /**
   * Reports one phase of one connection. The connection already holds the phase clocks and snapshot
   * version the vital needs; open reports must be written with `recordReport` first so the vital is
   * dated at the report.
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
  }

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

  function hasOpenConnection() {
    for (const connection of trackedConnections.values()) {
      if (connection.isOpen()) {
        return true
      }
    }
    return false
  }

  /**
   * Follows the timer to the population in phase `open`, so the periodic report costs nothing while
   * no connection is open.
   */
  function reportOpenConnectionsPeriodically() {
    const shouldReport = hasOpenConnection()

    if (shouldReport && reportIntervalId === undefined) {
      reportIntervalId = setInterval(reportOpenConnections, WEBSOCKET_PERIODIC_REPORT_INTERVAL)
    } else if (!shouldReport && reportIntervalId !== undefined) {
      clearInterval(reportIntervalId)
      reportIntervalId = undefined
    }
  }

  function clearTrackedConnections() {
    trackedConnections.clear()
    reportOpenConnectionsPeriodically()
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

        // recordOpen sets reportClocks to the open date and bumps the first snapshot version; the
        // later periodic reports are the ones where the two dates part
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

      // reported at most once per connection, which the observable's `readyState` guard is what
      // enforces
      case 'closing': {
        const connection = trackedConnections.get(context.instance)
        if (!connection) {
          return
        }

        connection.recordClosing(context)

        emitVital(context.instance, connection)

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

  const subscription = webSocketContextObservable.subscribe((context) => {
    handleWebSocketContext(context)

    // after every phase change rather than at the ones that happen to matter, so none can be missed.
    // Messages are the one hot path here and change no phase, so they are the exception
    if (context.state !== 'message-in' && context.state !== 'message-out') {
      reportOpenConnectionsPeriodically()
    }
  })

  return {
    reportOpenConnections,
    flushOpenConnections: (endClocks = clocksNow(), trackingEndReason = WebSocketTrackingEndReason.SESSION_END) => {
      const endedCount = trackedConnections.size
      trackedConnections.forEach((connection, instance) => {
        // no close event happened on this path, so the close outcome is genuinely absent rather
        // than defaulted
        connection.recordTrackingEnd(endClocks, trackingEndReason)
        emitVital(instance, connection)
      })

      clearTrackedConnections()
      return endedCount
    },
    stop: () => {
      subscription.unsubscribe()
      clearTrackedConnections()
    },
  }
}

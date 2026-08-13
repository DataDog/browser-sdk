import type { BufferedData, Observable } from '@datadog/browser-core'
import {
  BufferedDataType,
  ExperimentalFeature,
  generateUUID,
  isExperimentalFeatureEnabled,
  noop,
  sanitize,
} from '@datadog/browser-core'
import type { ClocksState, Duration, TimeStamp } from '@datadog/js-core/time'
import { clocksNow, elapsed } from '@datadog/js-core/time'
import { buildUrl } from '@datadog/js-core/util'
import { VitalType } from '../../rawRumEvent.types'
import type { RumConfiguration } from '../configuration'
import type { ViewHistory } from '../contexts/viewHistory'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { DurationVital } from '../vital/vitalCollection'

export const WEBSOCKET_CONNECTING_VITAL_NAME = 'websocket-connecting'
export const WEBSOCKET_CLOSED_VITAL_NAME = 'websocket-closed'

interface WebSocketConnection {
  webSocket: WebSocket
  connectionId: string
  url: string
  protocol?: string
  startClocks: ClocksState
  openClocks?: ClocksState
  startViewId?: string
  messagesIn: { count: number; size: number }
  messagesOut: { count: number; size: number }
  firstMessageInOffset?: Duration
  firstMessageOutOffset?: Duration
  lastMessageInAt?: TimeStamp
  longestInboundSilence: Duration
  bufferedAmountMax: number
  setupDuration?: Duration
}

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
  viewHistory: ViewHistory,
  addDurationVital: (vital: DurationVital) => void,
  bufferedDataObservable: Observable<BufferedData>
) {
  if (!isWebSocketCollectionEnabled(configuration)) {
    return { stop: noop }
  }

  const tracker = trackWebSocket(bufferedDataObservable, viewHistory, addDurationVital)

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
  viewHistory: ViewHistory,
  addDurationVital: (vital: DurationVital) => void
): WebSocketConnectionTracker {
  const webSocketRegistry = new Map<WebSocket, WebSocketConnection>()

  function completeConnection(webSocket: WebSocketConnection, endClocks: ClocksState) {
    addDurationVital({
      id: generateUUID(),
      name: WEBSOCKET_CLOSED_VITAL_NAME,
      type: VitalType.DURATION,
      startClocks: endClocks,
      duration: 0 as Duration,
      context: sanitize({
        url: webSocket.url,
        connection_id: webSocket.connectionId,
      }),
    })
  }

  const subscription = bufferedDataObservable.subscribe((bufferedData) => {
    if (bufferedData.type !== BufferedDataType.WEB_SOCKET) {
      return
    }

    const context = bufferedData.data
    switch (context.state) {
      case 'connecting': {
        const connectionId = generateUUID()
        const startViewId = viewHistory.findView(context.startClocks.relative)?.id
        const url = sanitizeWebSocketUrl(context.url)
        const webSocket: WebSocketConnection = {
          webSocket: context.instance,
          connectionId,
          url,
          startClocks: context.startClocks,
          startViewId,
          messagesIn: { count: 0, size: 0 },
          messagesOut: { count: 0, size: 0 },
          longestInboundSilence: 0 as Duration,
          bufferedAmountMax: 0,
        }
        webSocketRegistry.set(context.instance, webSocket)

        addDurationVital({
          id: generateUUID(),
          name: WEBSOCKET_CONNECTING_VITAL_NAME,
          type: VitalType.DURATION,
          startClocks: context.startClocks,
          duration: 0 as Duration,
          context: sanitize({
            url,
            connection_id: connectionId,
          }),
        })
        return
      }

      case 'open': {
        const webSocket = webSocketRegistry.get(context.instance)
        if (!webSocket) {
          return
        }

        webSocket.openClocks = context.openClocks
        webSocket.protocol = context.protocol
        webSocket.setupDuration = elapsed(webSocket.startClocks.timeStamp, context.openClocks.timeStamp)

        return
      }

      case 'message-in': {
        const webSocket = webSocketRegistry.get(context.instance)
        if (!webSocket) {
          return
        }

        webSocket.messagesIn.count += 1
        webSocket.messagesIn.size += context.size
        recordMessageTiming(webSocket, context.at, 'in')

        return
      }

      case 'message-out': {
        const webSocket = webSocketRegistry.get(context.instance)
        if (!webSocket) {
          return
        }

        if (context.bufferedAmountPreSend > webSocket.bufferedAmountMax) {
          webSocket.bufferedAmountMax = context.bufferedAmountPreSend
        }
        webSocket.messagesOut.count += 1
        webSocket.messagesOut.size += context.size
        recordMessageTiming(webSocket, context.at, 'out')

        return
      }

      case 'closed': {
        const webSocket = webSocketRegistry.get(context.instance)
        if (!webSocket) {
          return
        }

        webSocketRegistry.delete(context.instance)

        completeConnection(webSocket, context.at)

        return
      }
    }
  })

  return {
    flushOpenConnections: (endClocks = clocksNow()) => {
      webSocketRegistry.forEach((webSocket) => {
        completeConnection(webSocket, endClocks)
      })

      webSocketRegistry.clear()
    },
    stop: () => {
      subscription.unsubscribe()
      webSocketRegistry.clear()
    },
  }
}

function sanitizeWebSocketUrl(url: string) {
  const sanitizedUrl = buildUrl(url)
  sanitizedUrl.search = ''
  return sanitizedUrl.href
}

function recordMessageTiming(webSocket: WebSocketConnection, at: ClocksState, direction: 'in' | 'out') {
  if (webSocket.openClocks === undefined) {
    // handshake failed
    return
  }

  const offset = elapsed(webSocket.openClocks.timeStamp, at.timeStamp)
  if (direction === 'in' && webSocket.firstMessageInOffset === undefined) {
    webSocket.firstMessageInOffset = offset
  } else if (direction === 'out' && webSocket.firstMessageOutOffset === undefined) {
    webSocket.firstMessageOutOffset = offset
  }

  if (direction === 'in') {
    if (webSocket.lastMessageInAt !== undefined) {
      const gap = elapsed(webSocket.lastMessageInAt, at.timeStamp)
      if (gap > webSocket.longestInboundSilence) {
        webSocket.longestInboundSilence = gap
      }
    }
    webSocket.lastMessageInAt = at.timeStamp
  }
}

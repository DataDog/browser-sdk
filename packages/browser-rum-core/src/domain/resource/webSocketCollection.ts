import type { Observable, WebSocketContext } from '@datadog/browser-core'
import { generateUUID, initWebSocketObservable, sanitize } from '@datadog/browser-core'
import type { ClocksState, Duration, TimeStamp } from '@datadog/js-core/time'
import { clocksNow, elapsed } from '@datadog/js-core/time'
import { VitalType } from '../../rawRumEvent.types'
import type { ViewHistory } from '../contexts/viewHistory'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { DurationVital } from '../vital/vitalCollection'

export const WEBSOCKET_CONNECTING_VITAL_NAME = 'websocket-connecting'

export type WebSocketTrackingEndReason = 'close_event' | 'session_end'

export interface WebSocketCompleteEvent {
  webSocket: WebSocket
  connectionId: string
  url: string
  protocol?: string
  startClocks: ClocksState
  endClocks: ClocksState
  startViewId?: string
  endViewId?: string
  messagesIn: { count: number; size: number }
  messagesOut: { count: number; size: number }
  firstMessageInOffset?: Duration
  firstMessageOutOffset?: Duration
  lastMessageInAt?: TimeStamp
  longestInboundSilence: Duration
  bufferedAmountMax: number
  inboundIdleDurationBeforeClose?: Duration
  closeCode?: number
  closeReason?: string
  wasClean?: boolean
  handshakeSucceeded: boolean
  trackingEndReason: WebSocketTrackingEndReason
  setupDuration: Duration
}

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
  flushOpenConnections: (reason: WebSocketTrackingEndReason) => void
  stop: () => void
}

export function startWebSocketCollection(
  lifeCycle: LifeCycle,
  viewHistory: ViewHistory,
  addDurationVital: (vital: DurationVital) => void
) {
  const tracker = trackWebSocket(lifeCycle, initWebSocketObservable(), viewHistory, addDurationVital)

  // Session-boundary cleanup happens on SESSION_EXPIRED (fired before SESSION_RENEWED). Open
  // connections are finalized once with trackingEndReason "session_end"; later events on the same
  // WebSocket instance are ignored.
  const sessionExpiredSubscription = lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, () => {
    tracker.flushOpenConnections('session_end')
  })

  return {
    stop: () => {
      sessionExpiredSubscription.unsubscribe()
      tracker.flushOpenConnections('session_end')
      tracker.stop()
    },
  }
}

export function trackWebSocket(
  lifeCycle: LifeCycle,
  webSocketContextObservable: Observable<WebSocketContext>,
  viewHistory: ViewHistory,
  addDurationVital: (vital: DurationVital) => void
): WebSocketConnectionTracker {
  const webSocketRegistry = new Map<WebSocket, WebSocketConnection>()

  const subscription = webSocketContextObservable.subscribe((context) => {
    switch (context.state) {
      case 'connecting': {
        const connectionId = generateUUID()
        const startViewId = viewHistory.findView(context.startClocks.relative)?.id
        const webSocket: WebSocketConnection = {
          webSocket: context.instance,
          connectionId,
          url: context.url,
          startClocks: context.startClocks,
          startViewId,
          messagesIn: { count: 0, size: 0 },
          messagesOut: { count: 0, size: 0 },
          longestInboundSilence: 0 as Duration,
          bufferedAmountMax: 0,
        }
        webSocketRegistry.set(context.instance, webSocket)

        addDurationVital({
          id: connectionId,
          name: WEBSOCKET_CONNECTING_VITAL_NAME,
          type: VitalType.DURATION,
          startClocks: context.startClocks,
          duration: 0 as Duration,
          context: sanitize({
            url: context.url,
            protocols: context.protocols,
            startViewId,
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

        lifeCycle.notify(
          LifeCycleEventType.WEBSOCKET_COMPLETED,
          buildCompletedEvent(webSocket, context, 'close_event', viewHistory)
        )

        return
      }
    }
  })

  return {
    flushOpenConnections: (reason) => {
      const at = clocksNow()

      webSocketRegistry.forEach((webSocket) => {
        lifeCycle.notify(
          LifeCycleEventType.WEBSOCKET_COMPLETED,
          buildCompletedEvent(webSocket, { at }, reason, viewHistory)
        )
      })

      webSocketRegistry.clear()
    },
    stop: () => {
      subscription.unsubscribe()
      webSocketRegistry.clear()
    },
  }
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

function buildCompletedEvent(
  webSocket: WebSocketConnection,
  endInfo: { at: ClocksState; code?: number; reason?: string; wasClean?: boolean },
  trackingEndReason: WebSocketTrackingEndReason,
  viewHistory: ViewHistory
): WebSocketCompleteEvent {
  const endClocks = endInfo.at
  const endViewId =
    trackingEndReason === 'session_end'
      ? // On session_end, the websocket event can be received after the active view has been closed.
        viewHistory.findView(endClocks.relative, { returnInactive: true })?.id
      : viewHistory.findView(endClocks.relative)?.id
  const inboundIdleDurationBeforeClose =
    webSocket.lastMessageInAt !== undefined ? elapsed(webSocket.lastMessageInAt, endClocks.timeStamp) : undefined

  const { openClocks, ...rest } = webSocket

  return {
    ...rest,
    endClocks,
    endViewId,
    inboundIdleDurationBeforeClose,
    trackingEndReason,
    handshakeSucceeded: openClocks !== undefined,
    setupDuration: webSocket.setupDuration ?? elapsed(webSocket.startClocks.timeStamp, endClocks.timeStamp),
    closeCode: endInfo.code,
    closeReason: endInfo.reason,
    wasClean: endInfo.wasClean,
  }
}

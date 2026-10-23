import type { ClocksState } from '@datadog/js-core/time'
import type {
  WebSocketClosedContext,
  WebSocketClosingContext,
  WebSocketConnectingContext,
  WebSocketMessageInContext,
  WebSocketMessageOutContext,
  WebSocketOpenContext,
} from '../../browser/webSocketObservable'

// Build the contexts the WebSocket observable notifies, to drive a tracked connection without a socket.

export function connectingContext(
  instance: WebSocket,
  startClocks: ClocksState,
  context: Partial<WebSocketConnectingContext> = {}
): WebSocketConnectingContext {
  return { state: 'connecting', instance, url: 'wss://example.com/socket', startClocks, ...context }
}

export function openContext(
  instance: WebSocket,
  openClocks: ClocksState,
  context: Partial<WebSocketOpenContext> = {}
): WebSocketOpenContext {
  return { state: 'open', instance, openClocks, protocol: '', extensions: '', ...context }
}

export function messageInContext(instance: WebSocket, size: number, at: ClocksState): WebSocketMessageInContext {
  return { state: 'message-in', instance, size, at }
}

export function messageOutContext(
  instance: WebSocket,
  size: number,
  bufferedAmountPreSend: number,
  at: ClocksState
): WebSocketMessageOutContext {
  return { state: 'message-out', instance, size, bufferedAmountPreSend, at }
}

export function closingContext(instance: WebSocket, at: ClocksState): WebSocketClosingContext {
  return { state: 'closing', instance, at }
}

export function closedContext(
  instance: WebSocket,
  at: ClocksState,
  context: Partial<WebSocketClosedContext> = {}
): WebSocketClosedContext {
  return { state: 'closed', instance, code: 1000, reason: '', wasClean: true, bufferedAmountAtClose: 0, at, ...context }
}

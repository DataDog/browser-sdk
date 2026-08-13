import { registerCleanupTask } from '../registerCleanupTask'

/**
 * Replace the `WebSocket` global with a test double. Specs drive it the way an application
 * would: construct a socket through {@link createMockWebSocket}, call `send()` on it, and
 * simulate the events the browser would dispatch.
 */
export function mockWebSocket() {
  const originalWebSocket = window.WebSocket

  window.WebSocket = MockWebSocket as unknown as typeof WebSocket

  registerCleanupTask(() => {
    window.WebSocket = originalWebSocket
  })
}

/**
 * Construct a socket through the `WebSocket` global, so that instrumentation installed on it
 * applies, while keeping the mock type to drive the connection.
 */
export function createMockWebSocket(url: string | URL, protocols?: string | string[]): MockWebSocket {
  return new (window.WebSocket as unknown as typeof MockWebSocket)(url, protocols)
}

// A minimal stand-in for the native `WebSocket` constructor. We do not connect to a real server in
// unit tests; instead we expose helpers to simulate the browser dispatching events on the instance.
export class MockWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  url: string
  protocol = ''
  extensions = ''
  bufferedAmount = 0
  readyState: number = MockWebSocket.CONNECTING
  onmessage: ((event: MessageEvent) => void) | null = null
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  // Payloads that reached the socket, in order, so that specs can check instrumentation forwards
  // them unaltered. Tests set `bufferedAmount` before calling send to verify it is sampled.
  sentData: Array<string | ArrayBufferLike | Blob | ArrayBufferView> = []

  constructor(url: string | URL, protocols?: string | string[]) {
    super()
    this.url = resolveWebSocketUrl(String(url))
    if (typeof protocols === 'string') {
      this.protocol = protocols
    }
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.sentData.push(data)
  }

  close(_code?: number, _reason?: string): void {
    this.readyState = MockWebSocket.CLOSED
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    const event = new Event('open')
    this.dispatchEvent(event)
    this.onopen?.(event)
  }

  simulateMessage(data: unknown) {
    const event = new MessageEvent('message', { data })
    this.dispatchEvent(event)
    this.onmessage?.(event)
  }

  simulateClose(code: number, reason: string, wasClean: boolean) {
    this.readyState = MockWebSocket.CLOSED
    // CloseEvent is not always constructable in test environments; use a plain Event with assigned fields.
    const event = Object.assign(new Event('close'), { code, reason, wasClean }) as CloseEvent
    this.dispatchEvent(event)
    this.onclose?.(event)
  }
}

// Mimics how a real browser resolves the URL passed to the `WebSocket` constructor: relative URLs
// are resolved against the document location, and `http(s)` schemes are translated to `ws(s)`.
function resolveWebSocketUrl(url: string): string {
  const resolved = new URL(url, location.href)
  if (resolved.protocol === 'http:') {
    resolved.protocol = 'ws:'
  } else if (resolved.protocol === 'https:') {
    resolved.protocol = 'wss:'
  }
  return resolved.href
}

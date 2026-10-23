import { Observable } from '../util/observable'
import type { EndpointBuilder } from './endpointBuilder'
import { newRetryState, sendWithRetryStrategy } from './sendWithRetryStrategy'
import type { Payload, HttpResponse, HttpRequestEvent } from './payload'

/**
 * A send strategy used by {@link createHttpRequest} for normal (non-exit) requests.
 *
 * @typeParam Body - The payload type.
 */
export type SendStrategy<Body extends Payload = Payload> = (
  endpointBuilder: EndpointBuilder,
  payload: Body,
  onResponse: (response: HttpResponse) => void
) => void

/**
 * A send strategy used by {@link createHttpRequest} for page-exit requests.
 *
 * Unlike {@link SendStrategy}, there is no `onResponse` callback: page-exit sends are
 * best-effort and the page may unload before a response arrives.
 *
 * @typeParam Body - The payload type.
 */
export type SendOnExitStrategy<Body extends Payload = Payload> = (
  endpointBuilder: EndpointBuilder,
  payload: Body
) => void

/**
 * An HTTP request handle returned by {@link createHttpRequest}.
 *
 * @typeParam Body - The payload type, defaulting to {@link Payload}.
 */
export interface HttpRequest<Body extends Payload = Payload> {
  /** Observable that emits an event for every send attempt outcome. */
  observable: Observable<HttpRequestEvent<Body>>
  /** Sends `payload` using the normal send strategy, with retry on transient failure. */
  send(this: void, payload: Body): void
  /** Sends `payload` using the page-exit send strategy (best-effort, no retry). */
  sendOnExit(this: void, payload: Body): void
}

/**
 * Creates an {@link HttpRequest} that sends payloads to every endpoint in `endpointBuilders`,
 * with automatic retry on transient failures.
 *
 * Browser-specific send mechanisms (fetch, sendBeacon) are injected via `sendStrategy` and
 * `sendOnExitStrategy` so this function remains free of browser APIs.
 *
 * @param endpointBuilders - Intake endpoints to send to (typically one primary + optional replica).
 * @param reportError - Called with a human-readable message when the send queue overflows.
 * @param sendStrategy - How to send a normal (non-exit) request.
 * @param sendOnExitStrategy - How to send a request on page exit (best-effort).
 */
export function createHttpRequest<Body extends Payload = Payload>(
  endpointBuilders: EndpointBuilder[],
  reportError: (message: string) => void,
  sendStrategy: SendStrategy<Body>,
  sendOnExitStrategy: SendOnExitStrategy<Body>
): HttpRequest<Body> {
  const observable = new Observable<HttpRequestEvent<Body>>()
  const retryState = newRetryState<Body>()

  return {
    observable,
    send: (payload: Body) => {
      for (const endpointBuilder of endpointBuilders) {
        sendWithRetryStrategy(
          payload,
          retryState,
          (payload, onResponse) => sendStrategy(endpointBuilder, payload, onResponse),
          endpointBuilder.trackType,
          reportError,
          observable
        )
      }
    },
    /**
     * Since fetch keepalive behaves like regular fetch on Firefox,
     * keep using sendBeaconStrategy on exit.
     */
    sendOnExit: (payload: Body) => {
      for (const endpointBuilder of endpointBuilders) {
        sendOnExitStrategy(endpointBuilder, payload)
      }
    },
  }
}

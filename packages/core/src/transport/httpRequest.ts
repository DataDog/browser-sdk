import type { EndpointBuilder } from '../domain/configuration'
import type { Context } from '../tools/serialisation/context'
import { monitor, monitorError } from '../tools/monitor'
import type { RawError } from '../domain/error/error.types'
import { Observable } from '../tools/observable'
import { newRetryState, sendWithRetryStrategy } from './sendWithRetryStrategy'

/**
 * Use POST request without content type to:
 * - avoid CORS preflight requests
 * - allow usage of sendBeacon
 *
 * multiple elements are sent separated by \n in order
 * to be parsed correctly without content type header
 */

export interface HttpRequest<Body extends Payload = Payload> {
  observable: Observable<HttpRequestEvent<Body>>
  send(this: void, payload: Body): void
  sendOnExit(this: void, payload: Body): void
}

export interface HttpResponse extends Context {
  status: number
  type?: ResponseType
}

export interface BandwidthStats {
  ongoingByteCount: number
  ongoingRequestCount: number
}

export type HttpRequestEvent<Body extends Payload = Payload> =
  | {
      // A request to send the given payload failed. (We may retry.)
      type: 'failure'
      bandwidth: BandwidthStats
      payload: Body
    }
  | {
      // The given payload was discarded because the request queue is full.
      type: 'queue-full'
      bandwidth: BandwidthStats
      payload: Body
    }
  | {
      // A request to send the given payload succeeded.
      type: 'success'
      bandwidth: BandwidthStats
      payload: Body
    }

export interface Payload {
  data: string | FormData | Blob
  bytesCount: number
  retry?: RetryInfo
  encoding?: 'deflate'
}

export interface RetryInfo {
  count: number
  lastFailureStatus: number
}

export function createHttpRequest<Body extends Payload = Payload>(
  endpointBuilder: EndpointBuilder,
  bytesLimit: number,
  reportError: (error: RawError) => void
): HttpRequest<Body> {
  const observable = new Observable<HttpRequestEvent<Body>>()
  const retryState = newRetryState<Body>()
  const sendStrategyForRetry = (payload: Body, onResponse: (r: HttpResponse) => void) =>
    fetchKeepAliveStrategy(endpointBuilder, bytesLimit, payload, onResponse)

  return {
    observable,
    send: (payload: Body) => {
      sendWithRetryStrategy(
        payload,
        retryState,
        sendStrategyForRetry,
        endpointBuilder.trackType,
        reportError,
        observable
      )
    },
    /**
     * Since fetch keepalive behaves like regular fetch on Firefox,
     * keep using sendBeaconStrategy on exit
     */
    sendOnExit: (payload: Body) => {
      sendBeaconStrategy(endpointBuilder, bytesLimit, payload)
    },
  }
}

function sendBeaconStrategy(endpointBuilder: EndpointBuilder, bytesLimit: number, payload: Payload) {
  const canUseBeacon = !!navigator.sendBeacon && payload.bytesCount < bytesLimit
  if (canUseBeacon) {
    try {
      const beaconUrl = endpointBuilder.build('beacon', payload)
      const isQueued = navigator.sendBeacon(beaconUrl, payload.data)

      if (isQueued) {
        return
      }
    } catch (e) {
      reportBeaconError(e)
    }
  }

  fetchStrategy(endpointBuilder, payload)
}

let hasReportedBeaconError = false

function reportBeaconError(e: unknown) {
  if (!hasReportedBeaconError) {
    hasReportedBeaconError = true
    monitorError(e)
  }
}

export function fetchKeepAliveStrategy(
  endpointBuilder: EndpointBuilder,
  bytesLimit: number,
  payload: Payload,
  onResponse?: (r: HttpResponse) => void
) {
  const canUseKeepAlive = isKeepAliveSupported() && payload.bytesCount < bytesLimit

  if (canUseKeepAlive) {
    const fetchUrl = endpointBuilder.build('fetch-keepalive', payload)

    fetch(fetchUrl, { method: 'POST', body: payload.data, keepalive: true, mode: 'cors' })
      .then(monitor((response: Response) => onResponse?.({ status: response.status, type: response.type })))
      .catch(monitor(() => fetchStrategy(endpointBuilder, payload, onResponse)))
  } else {
    fetchStrategy(endpointBuilder, payload, onResponse)
  }
}

export function fetchStrategy(
  endpointBuilder: EndpointBuilder,
  payload: Payload,
  onResponse?: (r: HttpResponse) => void
) {
  const fetchUrl = endpointBuilder.build('fetch', payload)

  fetch(fetchUrl, { method: 'POST', body: payload.data, mode: 'cors' })
    .then(monitor((response: Response) => onResponse?.({ status: response.status, type: response.type })))
    .catch(monitor(() => onResponse?.({ status: 0 })))
}

function isKeepAliveSupported() {
  // Request can throw, cf https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#errors
  try {
    return window.Request && 'keepalive' in new Request('http://a')
  } catch {
    return false
  }
}

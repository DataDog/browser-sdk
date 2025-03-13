import type { EndpointBuilder } from '../domain/configuration'
import type { Context } from '../tools/serialisation/context'
import { monitor, monitorError } from '../tools/monitor'
import type { RawError } from '../domain/error/error.types'
import { newRetryState, sendWithRetryStrategy } from './sendWithRetryStrategy'

/**
 * Use POST request without content type to:
 * - avoid CORS preflight requests
 * - allow usage of sendBeacon
 *
 * multiple elements are sent separated by \n in order
 * to be parsed correctly without content type header
 */

export type HttpRequest = ReturnType<typeof createHttpRequest>

export interface HttpResponse extends Context {
  status: number
  type?: ResponseType
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

export function createHttpRequest(
  endpointBuilder: EndpointBuilder,
  bytesLimit: number,
  reportError: (error: RawError) => void
) {
  const retryState = newRetryState()
  const sendStrategyForRetry = (payload: Payload, onResponse: (r: HttpResponse) => void) =>
    fetchKeepAliveStrategy(
      endpointBuilder,
      bytesLimit,
      payload,
      {
        transportStatus: retryState.transportStatus,
        currentBackoffTime: retryState.currentBackoffTime,
        ongoingRequestCount: retryState.bandwidthMonitor.ongoingRequestCount,
        ongoingByteCount: retryState.bandwidthMonitor.ongoingByteCount,
        queuedPayloads: retryState.queuedPayloads.size(),
        queuedPayloadsBytesCount: retryState.queuedPayloads.bytesCount,
        bytesLimit,
      },
      onResponse
    )

  return {
    send: (payload: Payload) => {
      sendWithRetryStrategy(payload, retryState, sendStrategyForRetry, endpointBuilder.trackType, reportError)
    },
    /**
     * Since fetch keepalive behaves like regular fetch on Firefox,
     * keep using sendBeaconStrategy on exit
     */
    sendOnExit: (payload: Payload) => {
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
  context?: Context,
  onResponse?: (r: HttpResponse) => void
) {
  const canUseKeepAlive = isKeepAliveSupported() && payload.bytesCount < bytesLimit

  if (canUseKeepAlive) {
    const fetchUrl = endpointBuilder.build('fetch-keepalive', payload)

    fetch(fetchUrl, { method: 'POST', body: payload.data, keepalive: true, mode: 'cors' })
      .then(monitor((response: Response) => onResponse?.({ status: response.status, type: response.type })))
      .catch(monitor(() => fetchStrategy(endpointBuilder, payload, { canUseKeepAlive, ...context }, onResponse)))
  } else {
    fetchStrategy(endpointBuilder, payload, { canUseKeepAlive, ...context }, onResponse)
  }
}

export function fetchStrategy(
  endpointBuilder: EndpointBuilder,
  payload: Payload,
  context?: Context,
  onResponse?: (r: HttpResponse) => void
) {
  const fetchUrl = endpointBuilder.build('fetch', payload)

  fetch(fetchUrl, { method: 'POST', body: payload.data, mode: 'cors' })
    .then(monitor((response: Response) => onResponse?.({ status: response.status, type: response.type })))
    .catch((error) => {
      monitorError(error, {
        trackType: endpointBuilder.trackType,
        payloadBytesCount: payload.bytesCount,
        ...context,
      })
      onResponse?.({ status: 0 })
    })
}

function isKeepAliveSupported() {
  // Request can throw, cf https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#errors
  try {
    return window.Request && 'keepalive' in new Request('http://a')
  } catch {
    return false
  }
}

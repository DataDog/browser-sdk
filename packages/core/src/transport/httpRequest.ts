import type { EndpointBuilder } from '../domain/configuration'
import { addTelemetryError } from '../domain/telemetry'
import type { Context } from '../tools/context'
import { monitor } from '../tools/monitor'
import type { RawError } from '../tools/error'
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
}

export interface Payload {
  data: string | FormData
  bytesCount: number
  retry?: RetryInfo
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
    fetchKeepAliveStrategy(endpointBuilder, bytesLimit, payload, onResponse)

  return {
    send: (payload: Payload) => {
      sendWithRetryStrategy(payload, retryState, sendStrategyForRetry, endpointBuilder.endpointType, reportError)
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

function sendBeaconStrategy(endpointBuilder: EndpointBuilder, bytesLimit: number, { data, bytesCount }: Payload) {
  const canUseBeacon = !!navigator.sendBeacon && bytesCount < bytesLimit
  if (canUseBeacon) {
    try {
      const beaconUrl = endpointBuilder.build('beacon')
      const isQueued = navigator.sendBeacon(beaconUrl, data)

      if (isQueued) {
        return
      }
    } catch (e) {
      reportBeaconError(e)
    }
  }

  const xhrUrl = endpointBuilder.build('xhr')
  sendXHR(xhrUrl, data)
}

let hasReportedBeaconError = false

function reportBeaconError(e: unknown) {
  if (!hasReportedBeaconError) {
    hasReportedBeaconError = true
    addTelemetryError(e)
  }
}

export function fetchKeepAliveStrategy(
  endpointBuilder: EndpointBuilder,
  bytesLimit: number,
  { data, bytesCount, retry }: Payload,
  onResponse?: (r: HttpResponse) => void
) {
  const canUseKeepAlive = isKeepAliveSupported() && bytesCount < bytesLimit
  if (canUseKeepAlive) {
    const fetchUrl = endpointBuilder.build('fetch', retry)
    fetch(fetchUrl, { method: 'POST', body: data, keepalive: true }).then(
      monitor((response: Response) => onResponse?.({ status: response.status })),
      monitor(() => {
        const xhrUrl = endpointBuilder.build('xhr', retry)
        // failed to queue the request
        sendXHR(xhrUrl, data, onResponse)
      })
    )
  } else {
    const xhrUrl = endpointBuilder.build('xhr', retry)
    sendXHR(xhrUrl, data, onResponse)
  }
}

function isKeepAliveSupported() {
  // Request can throw, cf https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#errors
  try {
    return window.Request && 'keepalive' in new Request('http://a')
  } catch {
    return false
  }
}

export function sendXHR(url: string, data: Payload['data'], onResponse?: (r: HttpResponse) => void) {
  const request = new XMLHttpRequest()
  const onLoadEnd = monitor(() => {
    // prevent multiple onResponse callbacks
    // if the xhr instance is reused by a third party
    request.removeEventListener('loadend', onLoadEnd)
    onResponse?.({ status: request.status })
  })
  request.open('POST', url, true)
  request.addEventListener('loadend', onLoadEnd)
  request.send(data)
}

import type { EndpointBuilder, Configuration } from '../domain/configuration'
import { addTelemetryError } from '../domain/telemetry'
import type { Context } from '../tools/serialisation/context'
import { monitor } from '../tools/monitor'
import { addEventListener } from '../browser/addEventListener'
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
  configuration: Configuration,
  endpointBuilder: EndpointBuilder,
  bytesLimit: number,
  reportError: (error: RawError) => void
) {
  const retryState = newRetryState()
  const sendStrategyForRetry = (payload: Payload, onResponse: (r: HttpResponse) => void) =>
    fetchKeepAliveStrategy(configuration, endpointBuilder, bytesLimit, payload, onResponse)

  return {
    send: (payload: Payload) => {
      sendWithRetryStrategy(payload, retryState, sendStrategyForRetry, endpointBuilder.trackType, reportError)
    },
    /**
     * Since fetch keepalive behaves like regular fetch on Firefox,
     * keep using sendBeaconStrategy on exit
     */
    sendOnExit: (payload: Payload) => {
      sendBeaconStrategy(configuration, endpointBuilder, bytesLimit, payload)
    },
  }
}

function sendBeaconStrategy(
  configuration: Configuration,
  endpointBuilder: EndpointBuilder,
  bytesLimit: number,
  payload: Payload
) {
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

  const xhrUrl = endpointBuilder.build('xhr', payload)
  sendXHR(configuration, xhrUrl, payload.data)
}

let hasReportedBeaconError = false

function reportBeaconError(e: unknown) {
  if (!hasReportedBeaconError) {
    hasReportedBeaconError = true
    addTelemetryError(e)
  }
}

export function fetchKeepAliveStrategy(
  configuration: Configuration,
  endpointBuilder: EndpointBuilder,
  bytesLimit: number,
  payload: Payload,
  onResponse?: (r: HttpResponse) => void
) {
  const canUseKeepAlive = isKeepAliveSupported() && payload.bytesCount < bytesLimit
  if (canUseKeepAlive) {
    const fetchUrl = endpointBuilder.build('fetch', payload)
    fetch(fetchUrl, { method: 'POST', body: payload.data, keepalive: true, mode: 'cors' }).then(
      monitor((response: Response) => onResponse?.({ status: response.status, type: response.type })),
      monitor(() => {
        const xhrUrl = endpointBuilder.build('xhr', payload)
        // failed to queue the request
        sendXHR(configuration, xhrUrl, payload.data, onResponse)
      })
    )
  } else {
    const xhrUrl = endpointBuilder.build('xhr', payload)
    sendXHR(configuration, xhrUrl, payload.data, onResponse)
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

export function sendXHR(
  configuration: Configuration,
  url: string,
  data: Payload['data'],
  onResponse?: (r: HttpResponse) => void
) {
  const request = new XMLHttpRequest()
  request.open('POST', url, true)
  if (data instanceof Blob) {
    // When using a Blob instance, IE does not use its 'type' to define the 'Content-Type' header
    // automatically, so the intake request ends up being rejected with an HTTP status 415
    // Defining the header manually fixes this issue.
    request.setRequestHeader('Content-Type', data.type)
  }
  addEventListener(
    configuration,
    request,
    'loadend',
    () => {
      onResponse?.({ status: request.status })
    },
    {
      // prevent multiple onResponse callbacks
      // if the xhr instance is reused by a third party
      once: true,
    }
  )
  request.send(data)
}

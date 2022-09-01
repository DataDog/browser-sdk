import type { EndpointBuilder } from '../domain/configuration'
import { addTelemetryError } from '../domain/telemetry'
import { monitor } from '../tools/monitor'
import { isExperimentalFeatureEnabled } from '../domain/configuration'
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
export interface HttpResponse {
  status: number
}

export interface Payload {
  data: string | FormData
  bytesCount: number
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
      if (!isExperimentalFeatureEnabled('retry')) {
        fetchKeepAliveStrategy(endpointBuilder, bytesLimit, payload)
      } else {
        sendWithRetryStrategy(payload, retryState, sendStrategyForRetry, endpointBuilder.endpointType, reportError)
      }
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
  const url = endpointBuilder.build()
  const canUseBeacon = !!navigator.sendBeacon && bytesCount < bytesLimit
  if (canUseBeacon) {
    try {
      const isQueued = navigator.sendBeacon(url, data)

      if (isQueued) {
        return
      }
    } catch (e) {
      reportBeaconError(e)
    }
  }

  sendXHR(url, data)
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
  { data, bytesCount }: Payload,
  onResponse?: (r: HttpResponse) => void
) {
  const url = endpointBuilder.build()
  const canUseKeepAlive = isKeepAliveSupported() && bytesCount < bytesLimit
  if (canUseKeepAlive) {
    fetch(url, { method: 'POST', body: data, keepalive: true }).then(
      monitor((response: Response) => onResponse?.({ status: response.status })),
      monitor(() => {
        // failed to queue the request
        sendXHR(url, data, onResponse)
      })
    )
  } else {
    sendXHR(url, data, onResponse)
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

function sendXHR(url: string, data: Payload['data'], onResponse?: (r: HttpResponse) => void) {
  const request = new XMLHttpRequest()
  request.open('POST', url, true)
  request.send(data)
  request.addEventListener(
    'loadend',
    monitor(() => {
      onResponse?.({ status: request.status })
    })
  )
}

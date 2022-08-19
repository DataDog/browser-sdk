import type { EndpointBuilder } from '../domain/configuration'
import { addTelemetryError } from '../domain/telemetry'
import { monitor } from '../tools/monitor'

/**
 * Use POST request without content type to:
 * - avoid CORS preflight requests
 * - allow usage of sendBeacon
 *
 * multiple elements are sent separated by \n in order
 * to be parsed correctly without content type header
 */

export type HttpRequest = ReturnType<typeof createHttpRequest>

export interface Payload {
  data: string | FormData
  bytesCount: number
}

export function createHttpRequest(endpointBuilder: EndpointBuilder, bytesLimit: number) {
  return {
    send: (payload: Payload) => {
      fetchKeepAliveStrategy(endpointBuilder, bytesLimit, payload)
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

function fetchKeepAliveStrategy(endpointBuilder: EndpointBuilder, bytesLimit: number, { data, bytesCount }: Payload) {
  const url = endpointBuilder.build()
  const canUseKeepAlive = window.Request && 'keepalive' in new Request('') && bytesCount < bytesLimit
  if (canUseKeepAlive) {
    fetch(url, { method: 'POST', body: data, keepalive: true }).catch(
      monitor(() => {
        // failed to queue the request
        sendXHR(url, data)
      })
    )
  } else {
    sendXHR(url, data)
  }
}

function sendXHR(url: string, data: Payload['data']) {
  const request = new XMLHttpRequest()
  request.open('POST', url, true)
  request.send(data)
}

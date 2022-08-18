import type { EndpointBuilder } from '../domain/configuration'
import { isExperimentalFeatureEnabled } from '../domain/configuration'
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

export function createHttpRequest(endpointBuilder: EndpointBuilder, bytesLimit: number) {
  function sendBeaconStrategy(data: string | FormData, bytesCount: number) {
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

  function fetchKeepAliveStrategy(data: string | FormData, bytesCount: number) {
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

  function sendXHR(url: string, data: string | FormData) {
    const request = new XMLHttpRequest()
    request.open('POST', url, true)
    request.send(data)
  }

  return {
    send: (data: string | FormData, bytesCount: number) => {
      if (!isExperimentalFeatureEnabled('fetch-keepalive')) {
        sendBeaconStrategy(data, bytesCount)
      } else {
        fetchKeepAliveStrategy(data, bytesCount)
      }
    },
    /**
     * Since fetch keepalive behaves like regular fetch on Firefox,
     * keep using sendBeaconStrategy on exit
     */
    sendOnExit: sendBeaconStrategy,
  }
}

let hasReportedBeaconError = false

function reportBeaconError(e: unknown) {
  if (!hasReportedBeaconError) {
    hasReportedBeaconError = true
    addTelemetryError(e)
  }
}

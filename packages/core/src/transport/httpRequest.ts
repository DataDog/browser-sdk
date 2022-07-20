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
  const browserSupportsKeepalive = window.Request && 'keepalive' in new Request('https://foo.com') // Request throw without a valid url
  const browserSupportSendBeacon = !!navigator.sendBeacon

  const bytesLimitReached = (bytesCount: number) => bytesCount >= bytesLimit

  const sendBeacon = (data: string | FormData, bytesCount: number) => {
    const url = endpointBuilder.build()
    const canUseBeacon = browserSupportSendBeacon && !bytesLimitReached(bytesCount)

    try {
      if (canUseBeacon && navigator.sendBeacon(url, data)) return
    } catch (e) {
      reportBeaconError(e)
    }

    sendXMLHttpRequest(url, data)
  }

  return {
    send: (data: string | FormData, bytesCount: number) => {
      if (!isExperimentalFeatureEnabled('fetch-keepalive')) {
        return sendBeacon(data, bytesCount)
      }

      const url = endpointBuilder.build()

      if (!browserSupportsKeepalive || bytesLimitReached(bytesCount)) {
        sendXMLHttpRequest(url, data)
        return
      }

      window
        .fetch(url, { method: 'POST', body: data, keepalive: true })
        .catch(monitor(() => sendXMLHttpRequest(url, data)))
    },
    sendBeacon,
  }
}

let hasReportedBeaconError = false
function reportBeaconError(e: unknown) {
  if (!hasReportedBeaconError) {
    hasReportedBeaconError = true
    addTelemetryError(e)
  }
}

function sendXMLHttpRequest(url: string, data: string | FormData) {
  const request = new XMLHttpRequest()
  request.open('POST', url, true)
  request.send(data)
}

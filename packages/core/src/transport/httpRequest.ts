import type { EndpointBuilder } from '../domain/configuration'
import { addTelemetryError } from '../domain/telemetry'

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
  return {
    send: (data: string | FormData, bytesCount: number) => {
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

      const request = new XMLHttpRequest()
      request.open('POST', url, true)
      request.send(data)
    },
  }
}

let hasReportedBeaconError = false

function reportBeaconError(e: unknown) {
  if (!hasReportedBeaconError) {
    hasReportedBeaconError = true
    addTelemetryError(e)
  }
}

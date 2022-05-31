import type { EndpointBuilder } from '../domain/configuration'
import { addTelemetryError } from '../domain/telemetry'
import { addFailedSendBeacon } from './failedSendBeacon'

/**
 * Use POST request without content type to:
 * - avoid CORS preflight requests
 * - allow usage of sendBeacon
 *
 * multiple elements are sent separated by \n in order
 * to be parsed correctly without content type header
 */
export class HttpRequest {
  constructor(private endpointBuilder: EndpointBuilder, private bytesLimit: number) {}

  send(data: string | FormData, bytesCount: number, flushReason?: string) {
    const url = this.endpointBuilder.build()
    const canUseBeacon = !!navigator.sendBeacon && bytesCount < this.bytesLimit
    if (canUseBeacon) {
      try {
        const isQueued = navigator.sendBeacon(url, data)

        if (isQueued) {
          return
        }

        addFailedSendBeacon(this.endpointBuilder.endpointType, bytesCount, flushReason)
      } catch (e) {
        reportBeaconError(e)
      }
    }

    const request = new XMLHttpRequest()
    request.open('POST', url, true)
    request.send(data)
  }
}

let hasReportedBeaconError = false
function reportBeaconError(e: unknown) {
  if (!hasReportedBeaconError) {
    hasReportedBeaconError = true
    addTelemetryError(e)
  }
}

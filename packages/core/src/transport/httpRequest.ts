import type { EndpointBuilder } from '../domain/configuration'
import { addMonitoringError } from '../domain/internalMonitoring'
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

  send(data: string | FormData, size: number, reason?: string) {
    const url = this.endpointBuilder.build()
    const canUseBeacon = !!navigator.sendBeacon && size < this.bytesLimit
    if (canUseBeacon) {
      try {
        const isQueued = navigator.sendBeacon(url, data)
        if (isQueued) {
          return
        }

        addFailedSendBeacon(this.endpointBuilder.endpointType, size, reason)
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
    addMonitoringError(e)
  }
}

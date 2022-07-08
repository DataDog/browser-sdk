import type { Configuration, EndpointBuilder } from '../domain/configuration'
import { addTelemetryError } from '../domain/telemetry'
import type { Observable } from '../tools/observable'
import { addFailedSendBeacon } from './failedSendBeacon'
import { httpRetry } from './httpRetry'

/**
 * Use POST request without content type to:
 * - avoid CORS preflight requests
 * - allow usage of sendBeacon
 *
 * multiple elements are sent separated by \n in order
 * to be parsed correctly without content type header
 */
export class HttpRequest {
  sendWithRetry: (data: string | FormData, bytesCount: number) => Observable<Response>

  constructor(private endpointBuilder: EndpointBuilder, private configuration: Configuration) {
    ;({ retried: this.sendWithRetry } = httpRetry(this.send, configuration))
  }

  send(data: string | FormData, bytesCount: number, flushReason?: string) {
    const url = this.endpointBuilder.build()
    const canUseBeacon = !!navigator.sendBeacon && bytesCount < this.configuration.batchBytesLimit
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

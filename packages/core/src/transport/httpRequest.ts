import type { EndpointBuilder } from '../domain/configuration'
import { monitor, addMonitoringError, addMonitoringMessage } from '../domain/internalMonitoring'

let hasReportedXhrError = false

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

  send(data: string | FormData, size: number, flushReason?: string) {
    const url = this.endpointBuilder.build()
    const tryBeacon = !!navigator.sendBeacon && size < this.bytesLimit
    if (tryBeacon) {
      try {
        const isQueued = navigator.sendBeacon(url, data)
        if (isQueued) {
          return
        }
      } catch (e) {
        reportBeaconError(e)
      }
    }

    const transportIntrospection = (event: ProgressEvent) => {
      const req = event?.currentTarget as XMLHttpRequest
      if (req.status >= 200 && req.status < 300) {
        return
      }
      if (!hasReportedXhrError) {
        hasReportedXhrError = true
        addMonitoringMessage('XHR fallback failed', {
          on_line: navigator.onLine,
          size,
          url,
          try_beacon: tryBeacon,
          flush_reason: flushReason,
          event: {
            is_trusted: event.isTrusted,
            total: event.total,
            loaded: event.loaded,
          },
          request: {
            status: req.status,
            ready_state: req.readyState,
            response_text: req.responseText.slice(0, 512),
          },
        })
      }
    }

    const request = new XMLHttpRequest()
    request.addEventListener(
      'loadend',
      monitor((event) => transportIntrospection(event))
    )
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

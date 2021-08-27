import { monitor, addErrorToMonitoringBatch, addMonitoringMessage } from '../domain/internalMonitoring'

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
  constructor(private endpointUrl: string, private bytesLimit: number, private withBatchTime: boolean = false) {}

  send(data: string | FormData, size: number) {
    const url = this.withBatchTime ? addBatchTime(this.endpointUrl) : this.endpointUrl
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
          event: {
            is_trusted: event.isTrusted,
            total: event.total,
            loaded: event.loaded,
          },
          request: {
            status: req.status,
            ready_state: req.readyState,
            response_text: req.responseText.slice(0, 64),
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

function addBatchTime(url: string) {
  return `${url}${url.indexOf('?') === -1 ? '?' : '&'}batch_time=${new Date().getTime()}`
}

let hasReportedBeaconError = false
function reportBeaconError(e: unknown) {
  if (!hasReportedBeaconError) {
    hasReportedBeaconError = true
    addErrorToMonitoringBatch(e)
  }
}

import type { EndpointBuilder, Payload, HttpResponse, HttpRequestEvent } from '@datadog/js-core/transport'
import { RECOMMENDED_REQUEST_BYTES_LIMIT, newRetryState, sendWithRetryStrategy } from '@datadog/js-core/transport'
import { monitor, monitorError } from '@datadog/js-core/monitor'
import { buildUrl, globalObject, Observable } from '@datadog/js-core/util'
import { fetch } from '@datadog/js-core/dom'

/**
 * Use POST request without content type to:
 * - avoid CORS preflight requests
 * - allow usage of sendBeacon
 *
 * multiple elements are sent separated by \n in order
 * to be parsed correctly without content type header
 */

export interface HttpRequest<Body extends Payload = Payload> {
  observable: Observable<HttpRequestEvent<Body>>
  send(this: void, payload: Body): void
  sendOnExit(this: void, payload: Body): void
}

export function createHttpRequest<Body extends Payload = Payload>(
  endpointBuilders: EndpointBuilder[],
  reportError: (message: string) => void,
  bytesLimit: number = RECOMMENDED_REQUEST_BYTES_LIMIT
): HttpRequest<Body> {
  const observable = new Observable<HttpRequestEvent<Body>>()
  const retryState = newRetryState<Body>()

  return {
    observable,
    send: (payload: Body) => {
      for (const endpointBuilder of endpointBuilders) {
        sendWithRetryStrategy(
          payload,
          retryState,
          (payload, onResponse) => {
            fetchStrategy(endpointBuilder, payload, onResponse)
          },
          endpointBuilder.trackType,
          reportError,
          observable
        )
      }
    },
    /**
     * Since fetch keepalive behaves like regular fetch on Firefox,
     * keep using sendBeaconStrategy on exit
     */
    sendOnExit: (payload: Body) => {
      for (const endpointBuilder of endpointBuilders) {
        sendBeaconStrategy(endpointBuilder, bytesLimit, payload)
      }
    },
  }
}

function sendBeaconStrategy(endpointBuilder: EndpointBuilder, bytesLimit: number, payload: Payload) {
  if (payload.bytesCount < bytesLimit) {
    try {
      // Check the final endpoint because a relative proxy can resolve to a non-HTTP(S) URL.
      const beaconUrl = endpointBuilder.build('beacon', payload)
      const beaconUrlProtocol = buildUrl(
        beaconUrl,
        globalObject.document?.baseURI ?? globalObject.location?.href
      ).protocol

      // sendBeacon only accepts HTTP(S) endpoints; other protocols fall back to fetch.
      if (beaconUrlProtocol === 'http:' || beaconUrlProtocol === 'https:') {
        const isQueued = navigator.sendBeacon(beaconUrl, payload.data)
        if (isQueued) {
          return
        }
      }
    } catch (e) {
      reportBeaconError(e)
    }
  }

  fetchStrategy(endpointBuilder, payload)
}

let hasReportedBeaconError = false

function reportBeaconError(e: unknown) {
  if (!hasReportedBeaconError) {
    hasReportedBeaconError = true
    monitorError(e)
  }
}

export function fetchStrategy(
  endpointBuilder: EndpointBuilder,
  payload: Payload,
  onResponse?: (r: HttpResponse) => void
) {
  const fetchUrl = endpointBuilder.build('fetch', payload)

  fetch(fetchUrl, { method: 'POST', body: payload.data, mode: 'cors' })
    .then(monitor((response: Response) => onResponse?.({ status: response.status, type: response.type })))
    .catch(monitor(() => onResponse?.({ status: 0 })))
}

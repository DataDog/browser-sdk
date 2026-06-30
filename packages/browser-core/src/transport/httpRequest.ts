import type { EndpointBuilder, Payload, HttpResponse, HttpRequestEvent } from '@datadog/js-core/transport'
import { RECOMMENDED_REQUEST_BYTES_LIMIT } from '@datadog/js-core/transport'
import { fetch } from '../browser/fetch'
import { monitor, monitorError } from '../tools/monitor'
import { Observable } from '../tools/observable'
import { newRetryState, sendWithRetryStrategy } from './sendWithRetryStrategy'

/**
 * beacon payload max queue size implementation is 64kb
 * ensure that we leave room for logs, rum and potential other users
 */
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
  const canUseBeacon = payload.bytesCount < bytesLimit
  if (canUseBeacon) {
    try {
      const beaconUrl = endpointBuilder.build('beacon', payload)
      const isQueued = navigator.sendBeacon(beaconUrl, payload.data)

      if (isQueued) {
        return
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

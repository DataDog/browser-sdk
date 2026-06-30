import { createHttpRequest as jsCoreCreateHttpRequest, RECOMMENDED_REQUEST_BYTES_LIMIT } from '@datadog/js-core/transport'
import type { EndpointBuilder, Payload, HttpResponse } from '@datadog/js-core/transport'
import { fetch } from '../browser/fetch'
import { monitor, monitorError } from '../tools/monitor'

export type { HttpRequest } from '@datadog/js-core/transport'
export { RECOMMENDED_REQUEST_BYTES_LIMIT }

/**
 * Creates an {@link HttpRequest} wired to the browser's fetch and sendBeacon APIs.
 *
 * This is the browser-core entry point for building intake HTTP requests. It injects
 * {@link fetchStrategy} and {@link sendBeaconStrategy} into the generic js-core
 * implementation so it can be tested without browser globals.
 *
 * @param endpointBuilders - Intake endpoints to target.
 * @param reportError - Called when the send queue overflows.
 * @param bytesLimit - Beacon size limit; defaults to {@link RECOMMENDED_REQUEST_BYTES_LIMIT}.
 */
export function createHttpRequest<Body extends Payload = Payload>(
  endpointBuilders: EndpointBuilder[],
  reportError: (message: string) => void,
  bytesLimit: number = RECOMMENDED_REQUEST_BYTES_LIMIT
) {
  return jsCoreCreateHttpRequest<Body>(
    endpointBuilders,
    reportError,
    (endpointBuilder, payload, onResponse) => fetchStrategy(endpointBuilder, payload, onResponse),
    (endpointBuilder, payload) => sendBeaconStrategy(endpointBuilder, bytesLimit, payload)
  )
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

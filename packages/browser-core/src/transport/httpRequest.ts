import {
  createHttpRequest as jsCoreCreateHttpRequest,
  RECOMMENDED_REQUEST_BYTES_LIMIT,
} from '@datadog/js-core/transport'
import type { EndpointBuilder, Payload, HttpResponse } from '@datadog/js-core/transport'
import { monitor, monitorError } from '@datadog/js-core/monitor'
import { buildUrl, computeBytesCount, globalObject } from '@datadog/js-core/util'
import { fetch } from '@datadog/js-core/dom'

const MESSAGE_SEPARATOR_BYTES_COUNT = 1

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
  const httpRequest = jsCoreCreateHttpRequest<Body>(
    endpointBuilders,
    reportError,
    (endpointBuilder, payload, onResponse) => fetchStrategy(endpointBuilder, payload, onResponse),
    (endpointBuilder, payload) => sendBeaconStrategy(endpointBuilder, bytesLimit, payload)
  )
  return {
    ...httpRequest,
    sendOnExit: (payload: Body) => {
      const beaconPayloads = splitPayloadForBeacon(payload, bytesLimit)
      for (const endpointBuilder of endpointBuilders) {
        for (const beaconPayload of beaconPayloads) {
          sendBeaconStrategy(endpointBuilder, bytesLimit, beaconPayload)
        }
      }
    },
  }
}

/**
 * sendBeacon is only used for payloads under the bytes limit. A bigger payload falls back to a
 * plain fetch, which the page unload can cancel (WebKit cancels it as soon as a navigation starts).
 * A batch flushed on page exit can go over the limit, e.g. when the final view update grows the
 * view already in the batch. Split such a payload at message boundaries into parts under the limit,
 * so each part can still be sent with sendBeacon. A single message over the limit can't be split.
 */
function splitPayloadForBeacon<Body extends Payload>(payload: Body, bytesLimit: number): Body[] {
  if (payload.bytesCount < bytesLimit || typeof payload.data !== 'string') {
    return [payload]
  }

  const payloads: Body[] = []
  let messages: string[] = []
  let bytesCount = 0

  for (const message of payload.data.split('\n')) {
    const messageBytesCount = computeBytesCount(message)
    if (messages.length > 0 && bytesCount + MESSAGE_SEPARATOR_BYTES_COUNT + messageBytesCount >= bytesLimit) {
      payloads.push({ ...payload, data: messages.join('\n'), bytesCount })
      messages = []
      bytesCount = 0
    }
    bytesCount += (messages.length > 0 ? MESSAGE_SEPARATOR_BYTES_COUNT : 0) + messageBytesCount
    messages.push(message)
  }

  if (payloads.length === 0) {
    return [payload]
  }

  payloads.push({ ...payload, data: messages.join('\n'), bytesCount })
  return payloads
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
    .then(
      monitor((response: Response | undefined) =>
        // `fetch` can be overridden by a third party that resolves without a Response
        onResponse?.(response ? { status: response.status, type: response.type } : { status: 0 })
      )
    )
    .catch(monitor(() => onResponse?.({ status: 0 })))
}

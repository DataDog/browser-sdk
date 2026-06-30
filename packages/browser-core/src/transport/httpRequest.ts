import type { EndpointBuilder, Payload, HttpResponse, HttpRequestEvent } from '@datadog/js-core/transport'
import { RECOMMENDED_REQUEST_BYTES_LIMIT, newRetryState, sendWithRetryStrategy } from '@datadog/js-core/transport'
import { monitor, monitorError } from '@datadog/js-core/monitor'
import { buildUrl, computeBytesCount, globalObject, Observable } from '@datadog/js-core/util'
import { fetch } from '@datadog/js-core/dom'

const MESSAGE_SEPARATOR_BYTES_COUNT = 1

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
  // Each endpoint needs its own retry state: queued payloads don't remember their endpoint, so with
  // a shared state they would be retried to whichever endpoint drains the queue.
  const senders = endpointBuilders.map((endpointBuilder) => ({
    endpointBuilder,
    retryState: newRetryState<Body>(),
  }))

  return {
    observable,
    send: (payload: Body) => {
      for (const { endpointBuilder, retryState } of senders) {
        sendWithRetryStrategy(
          // Each endpoint gets its own copy, as retries record their attempts on the payload
          { ...payload },
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

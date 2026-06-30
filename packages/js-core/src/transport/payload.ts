import { ONE_KIBI_BYTE } from '../util/byteUtils'
import type { Context } from '../util/context'
import type { TransportRetryInfo } from './endpointBuilder'

/**
 * Maximum recommended byte count for a single HTTP request body.
 *
 * Beacon payloads are capped at 64 KiB by the browser; we leave room for
 * logs, RUM and other consumers by using 16 KiB as the recommended limit.
 * Used both to trigger batch flushes and as the default `sendBeacon` size guard.
 */
export const RECOMMENDED_REQUEST_BYTES_LIMIT = 16 * ONE_KIBI_BYTE

/**
 * A unit of data ready to be sent to an intake endpoint.
 *
 * `data` is the serialised (and optionally encoded) body. `bytesCount` is the
 * byte size of `data` as it will be transmitted — used for bandwidth accounting
 * and queue-full decisions.
 */
export interface Payload {
  data: string | FormData | Blob
  bytesCount: number
  retry?: TransportRetryInfo
  encoding?: 'deflate'
}

/**
 * An HTTP response received for an intake request.
 *
 * Extends {@link Context} so that extra metadata can be carried alongside the
 * mandatory `status` field.
 */
export interface HttpResponse extends Context {
  status: number
  type?: ResponseType
}

/**
 * Point-in-time bandwidth counters for all ongoing intake requests.
 */
export interface BandwidthStats {
  /** Total byte count currently in-flight across all ongoing requests. */
  ongoingByteCount: number
  /** Number of requests currently in flight. */
  ongoingRequestCount: number
}

/**
 * An event emitted on the {@link HttpRequest} observable to report the outcome of a send attempt.
 *
 * @typeParam Body - The payload type, defaulting to {@link Payload}.
 */
export type HttpRequestEvent<Body extends Payload = Payload> =
  | {
      /** A request to send the given payload failed. (We may retry.) */
      type: 'failure'
      bandwidth: BandwidthStats
      payload: Body
    }
  | {
      /** The given payload was discarded because the request queue is full. */
      type: 'queue-full'
      bandwidth: BandwidthStats
      payload: Body
    }
  | {
      /** A request to send the given payload succeeded. */
      type: 'success'
      bandwidth: BandwidthStats
      payload: Body
    }

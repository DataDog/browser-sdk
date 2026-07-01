import { createBatch as jsCreateBatch, MESSAGE_BYTES_LIMIT } from '@datadog/js-core/transport'
import type { EndpointBuilder, Batch } from '@datadog/js-core/transport'
import { createPageMayExitObservable } from '../browser/pageMayExitObservable'
import { DOCS_TROUBLESHOOTING, MORE_DETAILS, display } from '../tools/display'
import type { Encoder } from '../tools/encoder'
import { mockable } from '../tools/mockable'
import { createHttpRequest } from './httpRequest'

export type { Batch }
export { MESSAGE_BYTES_LIMIT }

/**
 * Creates a batch wired to the browser's HTTP transport and page-exit detection.
 *
 * This is a thin browser-core wrapper around the generic `createBatch` from js-core.
 * It injects:
 * - an `HttpRequest` built from `endpoints` using the browser fetch / sendBeacon strategies
 * - a `pageMayExitObservable` backed by DOM visibility and beforeunload events
 * - `display.warn` for oversized-message warnings (with the troubleshooting docs URL)
 *
 * @param options - See parameter descriptions below.
 * @param options.endpoints - Intake endpoint builders to send to.
 * @param options.reportError - Called when the send queue overflows.
 * @param options.encoder - Optional encoder; defaults to the identity encoder.
 */
export function createBatch({
  encoder,
  endpoints,
  reportError,
}: {
  encoder?: Encoder
  endpoints: EndpointBuilder[]
  reportError: (message: string) => void
}): Batch {
  const request = mockable(createHttpRequest)(endpoints, reportError)
  const pageMayExitObservable = mockable(createPageMayExitObservable)()

  return jsCreateBatch({
    request,
    pageMayExitObservable,
    encoder,
    reportError,
    warn: (message) => display.warn(`${message} ${MORE_DETAILS} ${DOCS_TROUBLESHOOTING}/#technical-limitations`),
  })
}

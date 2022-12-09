import type { MatchOption } from '@datadog/browser-core'

/**
 * dd: Datadog (x-datadog-*)
 * w3c: Trace Context (traceparent)
 * b3: B3 Single Header (b3)
 * b3m: B3 Multi Headers (X-B3-*)
 */
export type TracingHeadersType = 'dd' | 'b3' | 'b3m' | 'w3c'
export type TracingOption = { match: MatchOption; headersTypes: TracingHeadersType[] }

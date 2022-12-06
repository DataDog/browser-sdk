import type { MatchOption } from '@datadog/browser-core'

/**
 * dd: Datadog (x-datadog-*)
 * w3c: Trace Context (traceparent)
 * b3: B3 Single Header (b3)
 * b3m: B3 Multi Headers (X-B3-*)
 */
export const availableTracingHeaders = ['dd', 'b3', 'b3m', 'w3c'] as const
export type TracingHeadersType = typeof availableTracingHeaders[number]
export type ConfigureTracingOption = { match: MatchOption; headerTypes: TracingHeadersType[] }

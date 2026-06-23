import type { MatchOption } from '@openobserve/browser-core'

/**
 * datadog: Datadog (x-openobserve-*)
 * tracecontext: W3C Trace Context (traceparent, tracestate)
 * b3: B3 Single Header (b3)
 * b3multi: B3 Multiple Headers (X-B3-*)
 */
export type PropagatorType = 'datadog' | 'b3' | 'b3multi' | 'tracecontext'
export interface TracingOption {
  match: MatchOption
  propagatorTypes: PropagatorType[]
}

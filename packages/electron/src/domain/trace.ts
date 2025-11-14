export interface DatadogCarrier {
  __dd_carrier: true
  'x-datadog-origin': string
  'x-datadog-parent-id': string
  'x-datadog-sampling-priority': string
  'x-datadog-trace-id': string
}

export type Span = any
export type Trace = Span[]

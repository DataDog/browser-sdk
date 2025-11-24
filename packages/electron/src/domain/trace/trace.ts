import type { ClocksState, ServerDuration } from '@datadog/browser-core'

export interface DatadogCarrier {
  __dd_carrier: true
  'x-datadog-origin': string
  'x-datadog-parent-id': string
  'x-datadog-sampling-priority': string
  'x-datadog-trace-id': string
}

export interface SpanInfo {
  spanId: string
  traceId: string
  startClocks: ClocksState
  duration: ServerDuration
  name: string
}

export type Span = any
export type Trace = Span[]

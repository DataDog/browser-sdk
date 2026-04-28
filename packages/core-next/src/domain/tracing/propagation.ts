import type { Identifier } from './identifier'
import { toPaddedHexadecimalString } from './identifier'

export type PropagatorType = 'datadog' | 'tracecontext' | 'b3' | 'b3multi'

export function datadogHeaders(traceId: Identifier, spanId: Identifier, sampled: boolean): Record<string, string> {
  return {
    'x-datadog-trace-id': traceId.toString(10),
    'x-datadog-parent-id': spanId.toString(10),
    'x-datadog-sampling-priority': sampled ? '1' : '0',
    'x-datadog-origin': 'rum',
  }
}

export function tracecontextHeaders(
  traceId: Identifier,
  spanId: Identifier,
  sampled: boolean
): Record<string, string> {
  const traceHex = toPaddedHexadecimalString(traceId)
  const spanHex = toPaddedHexadecimalString(spanId)
  const sampledBit = sampled ? '01' : '00'

  return {
    traceparent: `00-0000000000000000${traceHex}-${spanHex}-${sampledBit}`,
    tracestate: `dd=s:${sampled ? '1' : '0'};o:rum`,
  }
}

export function b3Headers(traceId: Identifier, spanId: Identifier, sampled: boolean): Record<string, string> {
  const traceHex = toPaddedHexadecimalString(traceId)
  const spanHex = toPaddedHexadecimalString(spanId)
  const sampledBit = sampled ? '1' : '0'

  return {
    b3: `${traceHex}-${spanHex}-${sampledBit}`,
  }
}

export function b3multiHeaders(traceId: Identifier, spanId: Identifier, sampled: boolean): Record<string, string> {
  return {
    'X-B3-TraceId': traceId.toString(16),
    'X-B3-SpanId': spanId.toString(16),
    'X-B3-Sampled': sampled ? '1' : '0',
  }
}

export function makeTracingHeaders(
  traceId: Identifier,
  spanId: Identifier,
  sampled: boolean,
  propagatorTypes: PropagatorType[]
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const type of propagatorTypes) {
    let headers: Record<string, string>

    if (type === 'datadog') {
      headers = datadogHeaders(traceId, spanId, sampled)
    } else if (type === 'tracecontext') {
      headers = tracecontextHeaders(traceId, spanId, sampled)
    } else if (type === 'b3') {
      headers = b3Headers(traceId, spanId, sampled)
    } else {
      headers = b3multiHeaders(traceId, spanId, sampled)
    }

    Object.assign(result, headers)
  }

  return result
}

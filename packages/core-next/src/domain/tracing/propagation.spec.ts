import { createIdentifier, toPaddedHexadecimalString } from './identifier'
import { b3Headers, b3multiHeaders, datadogHeaders, makeTracingHeaders, tracecontextHeaders } from './propagation'

function makeIds() {
  const traceId = createIdentifier(64)
  const spanId = createIdentifier(64)
  return { traceId, spanId }
}

describe('datadogHeaders', () => {
  it('includes x-datadog-trace-id as decimal', () => {
    const { traceId, spanId } = makeIds()
    const headers = datadogHeaders(traceId, spanId, true)

    expect(/^\d+$/.test(headers['x-datadog-trace-id']!)).toBe(true)
    expect(headers['x-datadog-trace-id']).toBe(traceId.toString(10))
  })

  it('includes x-datadog-parent-id as decimal', () => {
    const { traceId, spanId } = makeIds()
    const headers = datadogHeaders(traceId, spanId, true)

    expect(headers['x-datadog-parent-id']).toBe(spanId.toString(10))
  })

  it('includes x-datadog-sampling-priority 1 when sampled', () => {
    const { traceId, spanId } = makeIds()
    const headers = datadogHeaders(traceId, spanId, true)

    expect(headers['x-datadog-sampling-priority']).toBe('1')
  })

  it('includes x-datadog-sampling-priority 0 when not sampled', () => {
    const { traceId, spanId } = makeIds()
    const headers = datadogHeaders(traceId, spanId, false)

    expect(headers['x-datadog-sampling-priority']).toBe('0')
  })

  it('includes x-datadog-origin rum', () => {
    const { traceId, spanId } = makeIds()
    const headers = datadogHeaders(traceId, spanId, true)

    expect(headers['x-datadog-origin']).toBe('rum')
  })
})

describe('tracecontextHeaders', () => {
  it('traceparent has correct format 00-{32hex}-{16hex}-0{bit}', () => {
    const { traceId, spanId } = makeIds()
    const headers = tracecontextHeaders(traceId, spanId, true)
    const traceparent = headers['traceparent']!

    expect(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/.test(traceparent)).toBe(true)
  })

  it('traceparent ends with 01 when sampled', () => {
    const { traceId, spanId } = makeIds()
    const headers = tracecontextHeaders(traceId, spanId, true)

    expect(headers['traceparent']!.endsWith('-01')).toBe(true)
  })

  it('traceparent ends with 00 when not sampled', () => {
    const { traceId, spanId } = makeIds()
    const headers = tracecontextHeaders(traceId, spanId, false)

    expect(headers['traceparent']!.endsWith('-00')).toBe(true)
  })

  it('tracestate includes dd=s:1;o:rum when sampled', () => {
    const { traceId, spanId } = makeIds()
    const headers = tracecontextHeaders(traceId, spanId, true)

    expect(headers['tracestate']).toBe('dd=s:1;o:rum')
  })

  it('tracestate includes dd=s:0;o:rum when not sampled', () => {
    const { traceId, spanId } = makeIds()
    const headers = tracecontextHeaders(traceId, spanId, false)

    expect(headers['tracestate']).toBe('dd=s:0;o:rum')
  })

  it('traceparent trace-id section is 0000000000000000 padded + 16 hex chars of traceId', () => {
    const { traceId, spanId } = makeIds()
    const headers = tracecontextHeaders(traceId, spanId, true)
    const parts = headers['traceparent']!.split('-')
    const traceIdSection = parts[1]!

    expect(traceIdSection).toBe('0000000000000000' + toPaddedHexadecimalString(traceId))
  })

  it('traceparent parent-id section matches spanId hex', () => {
    const { traceId, spanId } = makeIds()
    const headers = tracecontextHeaders(traceId, spanId, true)
    const parts = headers['traceparent']!.split('-')
    const parentIdSection = parts[2]!

    expect(parentIdSection).toBe(toPaddedHexadecimalString(spanId))
  })
})

describe('b3Headers', () => {
  it('includes b3 header in {hex16}-{hex16}-{bit} format', () => {
    const { traceId, spanId } = makeIds()
    const headers = b3Headers(traceId, spanId, true)

    expect(/^[0-9a-f]{16}-[0-9a-f]{16}-[01]$/.test(headers['b3']!)).toBe(true)
  })

  it('b3 ends with 1 when sampled', () => {
    const { traceId, spanId } = makeIds()
    const headers = b3Headers(traceId, spanId, true)

    expect(headers['b3']!.endsWith('-1')).toBe(true)
  })

  it('b3 ends with 0 when not sampled', () => {
    const { traceId, spanId } = makeIds()
    const headers = b3Headers(traceId, spanId, false)

    expect(headers['b3']!.endsWith('-0')).toBe(true)
  })
})

describe('b3multiHeaders', () => {
  it('includes X-B3-TraceId as hex', () => {
    const { traceId, spanId } = makeIds()
    const headers = b3multiHeaders(traceId, spanId, true)

    expect(/^[0-9a-f]+$/.test(headers['X-B3-TraceId']!)).toBe(true)
    expect(headers['X-B3-TraceId']).toBe(traceId.toString(16))
  })

  it('includes X-B3-SpanId as hex', () => {
    const { traceId, spanId } = makeIds()
    const headers = b3multiHeaders(traceId, spanId, true)

    expect(headers['X-B3-SpanId']).toBe(spanId.toString(16))
  })

  it('includes X-B3-Sampled 1 when sampled', () => {
    const { traceId, spanId } = makeIds()
    const headers = b3multiHeaders(traceId, spanId, true)

    expect(headers['X-B3-Sampled']).toBe('1')
  })

  it('includes X-B3-Sampled 0 when not sampled', () => {
    const { traceId, spanId } = makeIds()
    const headers = b3multiHeaders(traceId, spanId, false)

    expect(headers['X-B3-Sampled']).toBe('0')
  })
})

describe('makeTracingHeaders', () => {
  it('merges datadog and tracecontext headers', () => {
    const { traceId, spanId } = makeIds()
    const headers = makeTracingHeaders(traceId, spanId, true, ['datadog', 'tracecontext'])

    expect(headers['x-datadog-trace-id']).toBeDefined()
    expect(headers['traceparent']).toBeDefined()
  })

  it('returns only requested propagators', () => {
    const { traceId, spanId } = makeIds()
    const headers = makeTracingHeaders(traceId, spanId, true, ['b3'])

    expect(headers['b3']).toBeDefined()
    expect(headers['x-datadog-trace-id']).toBeUndefined()
    expect(headers['traceparent']).toBeUndefined()
  })

  it('merges all four propagators', () => {
    const { traceId, spanId } = makeIds()
    const headers = makeTracingHeaders(traceId, spanId, true, ['datadog', 'tracecontext', 'b3', 'b3multi'])

    expect(headers['x-datadog-trace-id']).toBeDefined()
    expect(headers['traceparent']).toBeDefined()
    expect(headers['b3']).toBeDefined()
    expect(headers['X-B3-TraceId']).toBeDefined()
  })
})

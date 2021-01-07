import { Configuration, getOrigin, objectEntries } from '@datadog/browser-core'
import {
  RumFetchCompleteContext,
  RumFetchStartContext,
  RumXhrCompleteContext,
  RumXhrStartContext,
} from '../requestCollection'

export interface Tracer {
  traceFetch: (context: Partial<RumFetchStartContext>) => void
  traceXhr: (context: Partial<RumXhrStartContext>, xhr: XMLHttpRequest) => void
  clearTracingIfCancelled: (context: RumFetchCompleteContext | RumXhrCompleteContext) => void
}

interface TracingHeaders {
  [key: string]: string
}

export function clearTracingIfCancelled(context: RumFetchCompleteContext | RumXhrCompleteContext) {
  if (context.status === 0) {
    context.traceId = undefined
    context.spanId = undefined
  }
}

export function startTracer(configuration: Configuration): Tracer {
  return {
    clearTracingIfCancelled,
    traceFetch: (context) =>
      injectHeadersIfTracingAllowed(configuration, context, (tracingHeaders: TracingHeaders) => {
        context.init = { ...context.init }
        const headers: string[][] = []
        if (context.init.headers instanceof Headers) {
          context.init.headers.forEach((value, key) => {
            headers.push([key, value])
          })
        } else if (Array.isArray(context.init.headers)) {
          context.init.headers.forEach((header) => {
            headers.push(header)
          })
        } else if (context.init.headers) {
          Object.keys(context.init.headers).forEach((key) => {
            headers.push([key, (context.init!.headers as Record<string, string>)[key]])
          })
        }
        context.init.headers = headers.concat(objectEntries(tracingHeaders) as string[][])
      }),
    traceXhr: (context, xhr) =>
      injectHeadersIfTracingAllowed(configuration, context, (tracingHeaders: TracingHeaders) => {
        Object.keys(tracingHeaders).forEach((name) => {
          xhr.setRequestHeader(name, tracingHeaders[name])
        })
      }),
  }
}

function injectHeadersIfTracingAllowed(
  configuration: Configuration,
  context: Partial<RumFetchStartContext | RumXhrStartContext>,
  inject: (tracingHeaders: TracingHeaders) => void
) {
  if (!isTracingSupported() || !isAllowedUrl(configuration, context.url!)) {
    return
  }

  context.traceId = new TraceIdentifier()
  context.spanId = new TraceIdentifier()
  inject(makeTracingHeaders(context.traceId, context.spanId))
}

function isAllowedUrl(configuration: Configuration, requestUrl: string) {
  const requestOrigin = getOrigin(requestUrl)
  for (const allowedOrigin of configuration.allowedTracingOrigins) {
    if (requestOrigin === allowedOrigin || (allowedOrigin instanceof RegExp && allowedOrigin.test(requestOrigin))) {
      return true
    }
  }
  return false
}

export function isTracingSupported() {
  return getCrypto() !== undefined
}

function getCrypto() {
  return window.crypto || (window as any).msCrypto
}

function makeTracingHeaders(traceId: TraceIdentifier, spanId: TraceIdentifier): TracingHeaders {
  return {
    'x-datadog-origin': 'rum',
    'x-datadog-parent-id': spanId.toDecimalString(),
    'x-datadog-sampled': '1',
    'x-datadog-sampling-priority': '1',
    'x-datadog-trace-id': traceId.toDecimalString(),
  }
}

/* tslint:disable:no-bitwise */
export class TraceIdentifier {
  private buffer: Uint8Array = new Uint8Array(8)

  constructor() {
    getCrypto().getRandomValues(this.buffer)
    this.buffer[0] = this.buffer[0] & 0x7f // force 63-bit
  }

  toString(radix: number) {
    let high = this.readInt32(0)
    let low = this.readInt32(4)
    let str = ''

    while (1) {
      const mod = (high % radix) * 4294967296 + low

      high = Math.floor(high / radix)
      low = Math.floor(mod / radix)
      str = (mod % radix).toString(radix) + str

      if (!high && !low) {
        break
      }
    }

    return str
  }

  /**
   * Format used everywhere except the trace intake
   */
  toDecimalString() {
    return this.toString(10)
  }

  private readInt32(offset: number) {
    return (
      this.buffer[offset] * 16777216 +
      (this.buffer[offset + 1] << 16) +
      (this.buffer[offset + 2] << 8) +
      this.buffer[offset + 3]
    )
  }
}
/* tslint:enable:no-bitwise */

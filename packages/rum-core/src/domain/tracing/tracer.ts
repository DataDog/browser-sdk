import {
  objectEntries,
  shallowClone,
  performDraw,
  isNumber,
  assign,
  display,
  find,
  startsWith,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import type {
  RumFetchResolveContext,
  RumFetchStartContext,
  RumXhrCompleteContext,
  RumXhrStartContext,
} from '../requestCollection'
import type { RumSessionManager } from '../rumSessionManager'
import type { ConfigureTracingOption, TracingHeadersType } from './tracer.types'

export interface Tracer {
  traceFetch: (context: Partial<RumFetchStartContext>) => void
  traceXhr: (context: Partial<RumXhrStartContext>, xhr: XMLHttpRequest) => void
  clearTracingIfNeeded: (context: RumFetchResolveContext | RumXhrCompleteContext) => void
}

interface TracingHeaders {
  [key: string]: string
}

/**
 * Clear tracing information to avoid incomplete traces. Ideally, we should do it when the
 * request did not reach the server, but the browser does not expose this. So, we clear tracing
 * information if the request ended with status 0 without being aborted by the application.
 *
 * Reasoning:
 *
 * * Applications are usually aborting requests after a bit of time, for example when the user is
 * typing (autocompletion) or navigating away (in a SPA). With a performant device and good
 * network conditions, the request is likely to reach the server before being canceled.
 *
 * * Requests aborted otherwise (ex: lack of internet, CORS issue, blocked by a privacy extension)
 * are likely to finish quickly and without reaching the server.
 *
 * Of course, it might not be the case every time, but it should limit having incomplete traces a
 * bit.
 * */
export function clearTracingIfNeeded(context: RumFetchResolveContext | RumXhrCompleteContext) {
  if (context.status === 0 && !context.isAborted) {
    context.traceId = undefined
    context.spanId = undefined
    context.traceSampled = undefined
  }
}

export function startTracer(configuration: RumConfiguration, sessionManager: RumSessionManager): Tracer {
  return {
    clearTracingIfNeeded,
    traceFetch: (context) =>
      injectHeadersIfTracingAllowed(configuration, context, sessionManager, (tracingHeaders: TracingHeaders) => {
        if (context.input instanceof Request && !context.init?.headers) {
          context.input = new Request(context.input)
          Object.keys(tracingHeaders).forEach((key) => {
            ;(context.input as Request).headers.append(key, tracingHeaders[key])
          })
        } else {
          context.init = shallowClone(context.init)
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
        }
      }),
    traceXhr: (context, xhr) =>
      injectHeadersIfTracingAllowed(configuration, context, sessionManager, (tracingHeaders: TracingHeaders) => {
        Object.keys(tracingHeaders).forEach((name) => {
          xhr.setRequestHeader(name, tracingHeaders[name])
        })
      }),
  }
}

function injectHeadersIfTracingAllowed(
  configuration: RumConfiguration,
  context: Partial<RumFetchStartContext | RumXhrStartContext>,
  sessionManager: RumSessionManager,
  inject: (tracingHeaders: TracingHeaders) => void
) {
  if (!isTracingSupported() || !sessionManager.findTrackedSession()) {
    return
  }

  const config = findConfigurationForUrl(configuration.configureTracingUrls, context.url!)
  if (!config) {
    return
  }

  context.traceId = new TraceIdentifier()
  context.spanId = new TraceIdentifier()
  context.traceSampled = !isNumber(configuration.tracingSampleRate) || performDraw(configuration.tracingSampleRate)
  inject(makeTracingHeaders(context.traceId, context.spanId, context.traceSampled, config.headerTypes))
}

function findConfigurationForUrl(configurationTracingUrls: ConfigureTracingOption[], url: string) {
  return find(configurationTracingUrls, (config: ConfigureTracingOption) => {
    try {
      const item = config.match
      if (typeof item === 'function') {
        return item(url)
      }
      if (item instanceof RegExp) {
        return item.test(url)
      }
      if (typeof item === 'string') {
        return startsWith(url, item)
      }
    } catch (e) {
      display.error(e)
    }
    return false
  })
}

export function isTracingSupported() {
  return getCrypto() !== undefined
}

function getCrypto() {
  return window.crypto || (window as any).msCrypto
}

/**
 * When trace is not sampled, set priority to '0' instead of not adding the tracing headers
 * to prepare the implementation for sampling delegation.
 */
function makeTracingHeaders(
  traceId: TraceIdentifier,
  spanId: TraceIdentifier,
  traceSampled: boolean,
  requestedHeaders: TracingHeadersType[]
): TracingHeaders {
  return requestedHeaders.reduce(
    (headers, request) =>
      assign(
        headers,
        makeTracingHeadersFor[request] ? makeTracingHeadersFor[request](traceId, spanId, traceSampled) : {}
      ),
    {} as TracingHeaders
  )
}

function makeTracingHeadersForDD(
  traceId: TraceIdentifier,
  spanId: TraceIdentifier,
  traceSampled: boolean
): TracingHeaders {
  return {
    'x-datadog-origin': 'rum',
    'x-datadog-parent-id': spanId.toDecimalString(),
    'x-datadog-sampling-priority': traceSampled ? '1' : '0',
    'x-datadog-trace-id': traceId.toDecimalString(),
  }
}

/**
 * https://www.w3.org/TR/trace-context/
 */
function makeTracingHeadersForW3C(
  traceId: TraceIdentifier,
  spanId: TraceIdentifier,
  traceSampled: boolean
): TracingHeaders {
  return {
    traceparent: `00-0000000000000000${traceId.toPaddedHexadecimalString()}-${spanId.toPaddedHexadecimalString()}-0${
      traceSampled ? '1' : '0'
    }`,
  }
}

/**
 * https://github.com/openzipkin/b3-propagation
 */
function makeTracingHeadersForB3(
  traceId: TraceIdentifier,
  spanId: TraceIdentifier,
  traceSampled: boolean
): TracingHeaders {
  return {
    b3: `${traceId.toPaddedHexadecimalString()}-${spanId.toPaddedHexadecimalString()}-${traceSampled ? '1' : '0'}`,
  }
}
function makeTracingHeadersForB3M(
  traceId: TraceIdentifier,
  spanId: TraceIdentifier,
  traceSampled: boolean
): TracingHeaders {
  return {
    'X-B3-TraceId': traceId.toPaddedHexadecimalString(),
    'X-B3-SpanId': spanId.toPaddedHexadecimalString(),
    'X-B3-Sampled': traceSampled ? '1' : '0',
  }
}

const makeTracingHeadersFor: {
  [key in TracingHeadersType]: (
    traceId: TraceIdentifier,
    spanId: TraceIdentifier,
    traceSampled: boolean
  ) => TracingHeaders
} = {
  dd: makeTracingHeadersForDD,
  w3c: makeTracingHeadersForW3C,
  b3: makeTracingHeadersForB3,
  b3m: makeTracingHeadersForB3M,
} as const

/* eslint-disable no-bitwise */
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

    do {
      const mod = (high % radix) * 4294967296 + low
      high = Math.floor(high / radix)
      low = Math.floor(mod / radix)
      str = (mod % radix).toString(radix) + str
    } while (high || low)

    return str
  }

  /**
   * Format used everywhere except the trace intake
   */
  toDecimalString() {
    return this.toString(10)
  }

  /**
   * Format used by OTel headers
   */
  toPaddedHexadecimalString() {
    const traceId = this.toString(16)
    return Array(17 - traceId.length).join('0') + traceId
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
/* eslint-enable no-bitwise */

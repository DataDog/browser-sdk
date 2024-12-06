import {
  objectEntries,
  shallowClone,
  isNumber,
  assign,
  find,
  getType,
  isMatchOption,
  matchList,
  TraceContextInjection,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import type {
  RumFetchResolveContext,
  RumFetchStartContext,
  RumXhrCompleteContext,
  RumXhrStartContext,
} from '../requestCollection'
import type { RumSessionManager } from '../rumSessionManager'
import { getCrypto } from '../../browser/crypto'
import type { PropagatorType, TracingOption } from './tracer.types'
import type { SpanIdentifier, TraceIdentifier } from './identifier'
import { createSpanIdentifier, createTraceIdentifier, toPaddedHexadecimalString } from './identifier'
import { isTraceSampled } from './sampler'

export interface Tracer {
  traceFetch: (context: Partial<RumFetchStartContext>) => void
  traceXhr: (context: Partial<RumXhrStartContext>, xhr: XMLHttpRequest) => void
  clearTracingIfNeeded: (context: RumFetchResolveContext | RumXhrCompleteContext) => void
}

interface TracingHeaders {
  [key: string]: string
}

export function isTracingOption(item: unknown): item is TracingOption {
  const expectedItem = item as TracingOption
  return (
    getType(expectedItem) === 'object' &&
    isMatchOption(expectedItem.match) &&
    Array.isArray(expectedItem.propagatorTypes)
  )
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
          const headers: Array<[string, string]> = []
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
          context.init.headers = headers.concat(objectEntries(tracingHeaders))
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

  const tracingOption = find(configuration.allowedTracingUrls, (tracingOption: TracingOption) =>
    matchList([tracingOption.match], context.url!, true)
  )
  if (!tracingOption) {
    return
  }
  const traceId = createTraceIdentifier()
  context.traceSampled =
    !isNumber(configuration.traceSampleRate) || isTraceSampled(traceId, configuration.traceSampleRate)

  if (!context.traceSampled && configuration.traceContextInjection !== TraceContextInjection.ALL) {
    return
  }

  context.traceId = traceId
  context.spanId = createSpanIdentifier()

  inject(makeTracingHeaders(context.traceId, context.spanId, context.traceSampled, tracingOption.propagatorTypes))
}

export function isTracingSupported() {
  return getCrypto() !== undefined
}

/**
 * When trace is not sampled, set priority to '0' instead of not adding the tracing headers
 * to prepare the implementation for sampling delegation.
 */
function makeTracingHeaders(
  traceId: TraceIdentifier,
  spanId: SpanIdentifier,
  traceSampled: boolean,
  propagatorTypes: PropagatorType[]
): TracingHeaders {
  const tracingHeaders: TracingHeaders = {}

  propagatorTypes.forEach((propagatorType) => {
    switch (propagatorType) {
      case 'datadog': {
        assign(tracingHeaders, {
          'x-datadog-origin': 'rum',
          'x-datadog-parent-id': spanId.toString(),
          'x-datadog-sampling-priority': traceSampled ? '1' : '0',
          'x-datadog-trace-id': traceId.toString(),
        })
        break
      }
      // https://www.w3.org/TR/trace-context/
      case 'tracecontext': {
        assign(tracingHeaders, {
          traceparent: `00-0000000000000000${toPaddedHexadecimalString(traceId)}-${toPaddedHexadecimalString(spanId)}-0${
            traceSampled ? '1' : '0'
          }`,
        })
        break
      }
      // https://github.com/openzipkin/b3-propagation
      case 'b3': {
        assign(tracingHeaders, {
          b3: `${toPaddedHexadecimalString(traceId)}-${toPaddedHexadecimalString(spanId)}-${traceSampled ? '1' : '0'}`,
        })
        break
      }
      case 'b3multi': {
        assign(tracingHeaders, {
          'X-B3-TraceId': toPaddedHexadecimalString(traceId),
          'X-B3-SpanId': toPaddedHexadecimalString(spanId),
          'X-B3-Sampled': traceSampled ? '1' : '0',
        })
        break
      }
    }
  })
  return tracingHeaders
}

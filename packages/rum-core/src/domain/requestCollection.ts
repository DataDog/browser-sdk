import {
  Configuration,
  Duration,
  FetchCompleteContext,
  FetchStartContext,
  RequestType,
  startFetchProxy,
  startXhrProxy,
  XhrCompleteContext,
  XhrStartContext,
  ClocksState,
} from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { isAllowedRequestUrl } from './rumEventsCollection/resource/resourceUtils'
import { startTracer, TraceIdentifier, Tracer } from './tracing/tracer'

export interface CustomContext {
  requestIndex: number
  spanId?: TraceIdentifier
  traceId?: TraceIdentifier
}
export interface RumFetchStartContext extends FetchStartContext, CustomContext {}
export interface RumFetchCompleteContext extends FetchCompleteContext, CustomContext {}
export interface RumXhrStartContext extends XhrStartContext, CustomContext {}
export interface RumXhrCompleteContext extends XhrCompleteContext, CustomContext {}

export interface RequestStartEvent {
  requestIndex: number
}

export interface RequestCompleteEvent {
  requestIndex: number
  type: RequestType
  method: string
  url: string
  status: number
  responseText?: string
  responseType?: string
  startClocks: ClocksState
  duration: Duration
  spanId?: TraceIdentifier
  traceId?: TraceIdentifier
  xhr?: XMLHttpRequest
  response?: Response
  input?: RequestInfo
  init?: RequestInit
  error?: Error
}

let nextRequestIndex = 1

export function startRequestCollection(lifeCycle: LifeCycle, configuration: Configuration) {
  const tracer = startTracer(configuration)
  trackXhr(lifeCycle, configuration, tracer)
  trackFetch(lifeCycle, configuration, tracer)
}

export function trackXhr(lifeCycle: LifeCycle, configuration: Configuration, tracer: Tracer) {
  const xhrProxy = startXhrProxy<RumXhrStartContext, RumXhrCompleteContext>()
  xhrProxy.beforeSend((context, xhr) => {
    if (isAllowedRequestUrl(configuration, context.url)) {
      tracer.traceXhr(context, xhr)
      context.requestIndex = getNextRequestIndex()

      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, {
        requestIndex: context.requestIndex,
      })
    }
  })
  xhrProxy.onRequestComplete((context) => {
    if (isAllowedRequestUrl(configuration, context.url)) {
      tracer.clearTracingIfNeeded(context)
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, {
        duration: context.duration,
        method: context.method,
        requestIndex: context.requestIndex,
        responseText: context.responseText,
        spanId: context.spanId,
        startClocks: context.startClocks,
        status: context.status,
        traceId: context.traceId,
        type: RequestType.XHR,
        url: context.url,
        xhr: context.xhr,
      })
    }
  })
  return xhrProxy
}

export function trackFetch(lifeCycle: LifeCycle, configuration: Configuration, tracer: Tracer) {
  const fetchProxy = startFetchProxy<RumFetchStartContext, RumFetchCompleteContext>()
  fetchProxy.beforeSend((context) => {
    if (isAllowedRequestUrl(configuration, context.url)) {
      tracer.traceFetch(context)
      context.requestIndex = getNextRequestIndex()

      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, {
        requestIndex: context.requestIndex,
      })
    }
  })
  fetchProxy.onRequestComplete((context) => {
    if (isAllowedRequestUrl(configuration, context.url)) {
      tracer.clearTracingIfNeeded(context)
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, {
        duration: context.duration,
        method: context.method,
        requestIndex: context.requestIndex,
        responseText: context.responseText,
        responseType: context.responseType,
        spanId: context.spanId,
        startClocks: context.startClocks,
        status: context.status,
        traceId: context.traceId,
        type: RequestType.FETCH,
        url: context.url,
        response: context.response,
        init: context.init,
        input: context.input,
      })
    }
  })
  return fetchProxy
}

function getNextRequestIndex() {
  const result = nextRequestIndex
  nextRequestIndex += 1
  return result
}

import { Configuration, Observable, RequestType, startFetchProxy, startXhrProxy } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { isAllowedRequestUrl } from './rumEventsCollection/resource/resourceUtils'
import {
  startTracer,
  TracedFetchCompleteContext,
  TracedFetchStartContext,
  TracedXhrCompleteContext,
  TracedXhrStartContext,
  TraceIdentifier,
  Tracer,
} from './tracing/tracer'

export interface RequestStartEvent {
  requestIndex: number
}

export interface RequestCompleteEvent {
  requestIndex: number
  type: RequestType
  method: string
  url: string
  status: number
  response?: string
  responseType?: string
  startTime: number
  duration: number
  spanId?: TraceIdentifier
  traceId?: TraceIdentifier
}

export type RequestObservables = [Observable<RequestStartEvent>, Observable<RequestCompleteEvent>]

let nextRequestIndex = 1

export function startRequestCollection(lifeCycle: LifeCycle, configuration: Configuration) {
  const tracer = startTracer(configuration)
  trackXhr(lifeCycle, configuration, tracer)
  trackFetch(lifeCycle, configuration, tracer)
}

export function trackXhr(lifeCycle: LifeCycle, configuration: Configuration, tracer: Tracer) {
  const xhrProxy = startXhrProxy<TracedXhrStartContext, TracedXhrCompleteContext>()
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
      tracer.clearTracingIfCancelled(context)
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, {
        duration: context.duration,
        method: context.method,
        requestIndex: context.requestIndex,
        response: context.response,
        spanId: context.spanId,
        startTime: context.startTime,
        status: context.status,
        traceId: context.traceId,
        type: RequestType.XHR,
        url: context.url,
      })
    }
  })
  return xhrProxy
}

export function trackFetch(lifeCycle: LifeCycle, configuration: Configuration, tracer: Tracer) {
  const fetchProxy = startFetchProxy<TracedFetchStartContext, TracedFetchCompleteContext>()
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
      tracer.clearTracingIfCancelled(context)
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, {
        duration: context.duration,
        method: context.method,
        requestIndex: context.requestIndex,
        response: context.response,
        responseType: context.responseType,
        spanId: context.spanId,
        startTime: context.startTime,
        status: context.status,
        traceId: context.traceId,
        type: RequestType.FETCH,
        url: context.url,
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

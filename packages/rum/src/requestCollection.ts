import {
  Configuration,
  FetchCompleteContext,
  FetchStartContext,
  Observable,
  RequestType,
  startFetchProxy,
  startXhrProxy,
  XhrCompleteContext,
  XhrStartContext,
} from '@datadog/browser-core'
import { isAllowedRequestUrl } from './resourceUtils'
import { startTracer, TraceIdentifier, Tracer } from './tracer'

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
  traceId?: TraceIdentifier
  spanId?: TraceIdentifier
}

interface CustomContext {
  traceId: TraceIdentifier | undefined
  spanId: TraceIdentifier | undefined
  requestIndex: number
}

export type RequestObservables = [Observable<RequestStartEvent>, Observable<RequestCompleteEvent>]

let nextRequestIndex = 1

export function startRequestCollection(configuration: Configuration) {
  const requestObservables: RequestObservables = [new Observable(), new Observable()]
  const tracer = startTracer(configuration)
  trackXhr(configuration, requestObservables, tracer)
  trackFetch(configuration, requestObservables, tracer)
  return requestObservables
}

export function trackXhr(
  configuration: Configuration,
  [requestStartObservable, requestCompleteObservable]: RequestObservables,
  tracer: Tracer
) {
  const xhrProxy = startXhrProxy<CustomContext & XhrStartContext, CustomContext & XhrCompleteContext>()
  xhrProxy.beforeSend((context, xhr) => {
    if (isAllowedRequestUrl(configuration, context.url)) {
      const tracingResult = tracer.traceXhr(context, xhr)
      if (tracingResult) {
        context.traceId = tracingResult.traceId
        context.spanId = tracingResult.spanId
      }
      context.requestIndex = getNextRequestIndex()

      requestStartObservable.notify({
        requestIndex: context.requestIndex,
      })
    }
  })
  xhrProxy.onRequestComplete((context) => {
    if (isAllowedRequestUrl(configuration, context.url)) {
      requestCompleteObservable.notify({
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

export function trackFetch(
  configuration: Configuration,
  [requestStartObservable, requestCompleteObservable]: RequestObservables,
  tracer: Tracer
) {
  const fetchProxy = startFetchProxy<CustomContext & FetchStartContext, CustomContext & FetchCompleteContext>()
  fetchProxy.beforeSend((context) => {
    if (isAllowedRequestUrl(configuration, context.url)) {
      const tracingResult = tracer.traceFetch(context)
      if (tracingResult) {
        context.traceId = tracingResult.traceId
        context.spanId = tracingResult.spanId
      }
      context.requestIndex = getNextRequestIndex()

      requestStartObservable.notify({
        requestIndex: context.requestIndex,
      })
    }
  })
  fetchProxy.onRequestComplete((context) => {
    if (isAllowedRequestUrl(configuration, context.url)) {
      requestCompleteObservable.notify({
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

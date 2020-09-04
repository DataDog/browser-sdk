import {
  Configuration,
  FetchContext,
  Observable,
  RequestType,
  startFetchProxy,
  startXhrProxy,
  XhrContext,
} from '@datadog/browser-core'
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

export type RequestObservables = [Observable<RequestStartEvent>, Observable<RequestCompleteEvent>]

let nextRequestIndex = 1

export function startRequestCollection(configuration: Configuration) {
  const requestObservables: RequestObservables = [new Observable(), new Observable()]
  const tracer = startTracer(configuration)
  trackXhr(requestObservables, tracer)
  trackFetch(requestObservables, tracer)
  return requestObservables
}

interface CustomXhrContext extends XhrContext {
  traceId: TraceIdentifier | undefined
  spanId: TraceIdentifier | undefined
  requestIndex: number
}

export function trackXhr([requestStartObservable, requestCompleteObservable]: RequestObservables, tracer: Tracer) {
  const xhrProxy = startXhrProxy<CustomXhrContext>()
  xhrProxy.beforeSend((context, xhr) => {
    const tracingResult = tracer.traceXhr(context, xhr)
    if (tracingResult) {
      context.traceId = tracingResult.traceId
      context.spanId = tracingResult.spanId
    }
    context.requestIndex = getNextRequestIndex()

    requestStartObservable.notify({
      requestIndex: context.requestIndex,
    })
  })
  xhrProxy.onRequestComplete((context) => {
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
  })
  return xhrProxy
}

interface CustomFetchContext extends FetchContext {
  traceId: TraceIdentifier | undefined
  spanId: TraceIdentifier | undefined
  requestIndex: number
}

export function trackFetch([requestStartObservable, requestCompleteObservable]: RequestObservables, tracer: Tracer) {
  const fetchProxy = startFetchProxy<CustomFetchContext>()
  fetchProxy.beforeSend((context) => {
    const tracingResult = tracer.traceFetch(context)
    if (tracingResult) {
      context.traceId = tracingResult.traceId
      context.spanId = tracingResult.spanId
    }
    context.requestIndex = getNextRequestIndex()

    requestStartObservable.notify({
      requestIndex: context.requestIndex,
    })
  })
  fetchProxy.onRequestComplete((context) => {
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
  })
  return fetchProxy
}

function getNextRequestIndex() {
  const result = nextRequestIndex
  nextRequestIndex += 1
  return result
}

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
  requestId: number
}

export interface RequestCompleteEvent {
  requestId: number
  type: RequestType
  method: string
  url: string
  status: number
  response?: string
  responseType?: string
  startTime: number
  duration: number
  error?: {
    name?: string
    message: string
    stack: string
  }
  traceId?: TraceIdentifier
}

export type RequestObservables = [Observable<RequestStartEvent>, Observable<RequestCompleteEvent>]

let nextRequestId = 1

export function startRequestCollection(configuration: Configuration) {
  const requestObservables: RequestObservables = [new Observable(), new Observable()]
  const tracer = startTracer(configuration)
  trackXhr(requestObservables, tracer)
  trackFetch(requestObservables, tracer)
  return requestObservables
}

interface CustomXhrContext extends XhrContext {
  traceId: TraceIdentifier | undefined
  requestId: number
}

export function trackXhr([requestStartObservable, requestCompleteObservable]: RequestObservables, tracer: Tracer) {
  const xhrProxy = startXhrProxy<CustomXhrContext>()
  xhrProxy.beforeSend((context, xhr) => {
    context.traceId = tracer.traceXhr(context, xhr)
    context.requestId = getNextRequestId()

    requestStartObservable.notify({
      requestId: context.requestId,
    })
  })
  xhrProxy.onRequestComplete((context) => {
    requestCompleteObservable.notify({
      duration: context.duration,
      method: context.method,
      requestId: context.requestId,
      response: context.response,
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
  requestId: number
}

export function trackFetch([requestStartObservable, requestCompleteObservable]: RequestObservables, tracer: Tracer) {
  const fetchProxy = startFetchProxy<CustomFetchContext>()
  fetchProxy.beforeSend((context) => {
    context.traceId = tracer.traceFetch(context)
    context.requestId = getNextRequestId()

    requestStartObservable.notify({
      requestId: context.requestId,
    })
  })
  fetchProxy.onRequestComplete((context) => {
    requestCompleteObservable.notify({
      duration: context.duration,
      error: context.error,
      method: context.method,
      requestId: context.requestId,
      response: context.response,
      responseType: context.responseType,
      startTime: context.startTime,
      status: context.status,
      traceId: context.traceId,
      type: RequestType.FETCH,
      url: context.url,
    })
  })
  return fetchProxy
}

function getNextRequestId() {
  const result = nextRequestId
  nextRequestId += 1
  return result
}

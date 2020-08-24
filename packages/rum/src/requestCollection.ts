import { Observable, RequestType, startFetchProxy, startXhrProxy } from '@datadog/browser-core'

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
  traceId?: number
}

export type RequestObservables = [Observable<RequestStartEvent>, Observable<RequestCompleteEvent>]

let nextRequestId = 1

export function startRequestCollection() {
  const requestObservables: RequestObservables = [new Observable(), new Observable()]
  trackXhr(requestObservables)
  trackFetch(requestObservables)
  return requestObservables
}

export function trackXhr([requestStartObservable, requestCompleteObservable]: RequestObservables) {
  const xhrProxy = startXhrProxy()
  xhrProxy.beforeSend((context) => {
    const requestId = getNextRequestId()
    context.requestId = requestId
    requestStartObservable.notify({
      requestId,
    })
  })
  xhrProxy.onRequestComplete((context) => {
    requestCompleteObservable.notify({
      duration: context.duration,
      method: context.method,
      requestId: context.requestId as number,
      response: context.response,
      startTime: context.startTime,
      status: context.status,
      traceId: getTraceId(),
      type: RequestType.XHR,
      url: context.url,
    })
  })
  return xhrProxy
}

export function trackFetch([requestStartObservable, requestCompleteObservable]: RequestObservables) {
  const fetchProxy = startFetchProxy()
  fetchProxy.beforeSend((context) => {
    const requestId = getNextRequestId()
    context.requestId = requestId
    requestStartObservable.notify({
      requestId,
    })
  })
  fetchProxy.onRequestComplete((context) => {
    requestCompleteObservable.notify({
      duration: context.duration,
      method: context.method,
      requestId: context.requestId as number,
      response: context.response,
      responseType: context.responseType,
      startTime: context.startTime,
      status: context.status,
      traceId: getTraceId(),
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

interface BrowserWindow extends Window {
  ddtrace?: any
}

/**
 * Get the current traceId generated from dd-trace-js (if any).
 *
 * Note: in order to work, the browser-sdk should be initialized *before* dd-trace-js because both
 * libraries are wrapping fetch() and XHR.  Wrappers are called in reverse order, and the
 * dd-trace-js wrapper needs to be called first so it can generate the new trace.  The browser-sdk
 * wrapper will then pick up the new trace id via this function.
 */
function getTraceId(): number | undefined {
  // tslint:disable-next-line: no-unsafe-any
  return 'ddtrace' in window && (window as BrowserWindow).ddtrace.tracer.scope().active()
    ? // tslint:disable-next-line: no-unsafe-any
      (window as BrowserWindow).ddtrace.tracer
        .scope()
        .active()
        .context()
        .toTraceId()
    : undefined
}

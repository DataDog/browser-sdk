import { toStackTraceString } from './errorCollection'
import { monitor } from './internalMonitoring'
import { Observable } from './observable'
import { computeStackTrace } from './tracekit'
import { normalizeUrl } from './urlPolyfill'
import { ResourceKind } from './utils'

export enum RequestType {
  FETCH = ResourceKind.FETCH,
  XHR = ResourceKind.XHR,
}

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

interface BrowserWindow extends Window {
  ddtrace?: any
}

interface BrowserXHR extends XMLHttpRequest {
  _datadog_xhr: {
    method: string
    url: string
  }
}

export interface RequestObservables {
  start: Observable<RequestStartEvent>
  complete: Observable<RequestCompleteEvent>
}

let nextRequestId = 1

function getNextRequestId() {
  const result = nextRequestId
  nextRequestId += 1
  return result
}

let globalObservables: RequestObservables

export function startRequestCollection() {
  if (!globalObservables) {
    globalObservables = {
      complete: new Observable(),
      start: new Observable(),
    }
    trackXhr(globalObservables)
    trackFetch(globalObservables)
  }
  return globalObservables
}

export function trackXhr(observables: RequestObservables) {
  const originalOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = monitor(function(this: BrowserXHR, method: string, url: string) {
    this._datadog_xhr = {
      method,
      url,
    }
    return originalOpen.apply(this, arguments as any)
  })

  const originalSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.send = function(this: BrowserXHR, body: unknown) {
    const startTime = performance.now()
    const requestId = getNextRequestId()

    observables.start.notify({
      requestId,
    })

    let hasBeenReported = false
    const reportXhr = () => {
      if (hasBeenReported) {
        return
      }
      hasBeenReported = true
      observables.complete.notify({
        requestId,
        startTime,
        duration: performance.now() - startTime,
        method: this._datadog_xhr.method,
        response: this.response as string | undefined,
        status: this.status,
        traceId: getTraceId(),
        type: RequestType.XHR,
        url: normalizeUrl(this._datadog_xhr.url),
      })
    }

    const originalOnreadystatechange = this.onreadystatechange

    this.onreadystatechange = function() {
      if (this.readyState === XMLHttpRequest.DONE) {
        monitor(reportXhr)()
      }

      if (originalOnreadystatechange) {
        originalOnreadystatechange.apply(this, arguments as any)
      }
    }

    this.addEventListener('loadend', monitor(reportXhr))

    return originalSend.apply(this, arguments as any)
  }
}

export function trackFetch(observables: RequestObservables) {
  if (!window.fetch) {
    return
  }
  const originalFetch = window.fetch
  // tslint:disable promise-function-async
  window.fetch = monitor(function(this: GlobalFetch['fetch'], input: RequestInfo, init?: RequestInit) {
    const method = (init && init.method) || (typeof input === 'object' && input.method) || 'GET'
    const startTime = performance.now()
    const requestId = getNextRequestId()

    observables.start.notify({
      requestId,
    })

    const reportFetch = async (response: Response | Error) => {
      const duration = performance.now() - startTime
      const url = normalizeUrl((typeof input === 'object' && input.url) || (input as string))
      if ('stack' in response || response instanceof Error) {
        const stackTrace = computeStackTrace(response)
        observables.complete.notify({
          duration,
          method,
          requestId,
          startTime,
          url,
          response: toStackTraceString(stackTrace),
          status: 0,
          traceId: getTraceId(),
          type: RequestType.FETCH,
        })
      } else if ('status' in response) {
        let text: string
        try {
          text = await response.clone().text()
        } catch (e) {
          text = `Unable to retrieve response: ${e}`
        }
        observables.complete.notify({
          duration,
          method,
          requestId,
          startTime,
          url,
          response: text,
          responseType: response.type,
          status: response.status,
          traceId: getTraceId(),
          type: RequestType.FETCH,
        })
      }
    }
    const responsePromise = originalFetch.call(this, input, init)
    responsePromise.then(monitor(reportFetch), monitor(reportFetch))
    return responsePromise
  })
}

export function isRejected(completeEvent: RequestCompleteEvent) {
  return completeEvent.status === 0 && completeEvent.responseType !== 'opaque'
}

export function isServerError(completeEvent: RequestCompleteEvent) {
  return completeEvent.status >= 500
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

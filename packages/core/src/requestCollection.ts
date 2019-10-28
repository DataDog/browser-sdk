import 'url-polyfill'

import { toStackTraceString } from './errorCollection'
import { monitor } from './internalMonitoring'
import { MessageObservable, MessageType, RequestMessage, RequestType } from './messages'
import { Observable } from './observable'
import { computeStackTrace } from './tracekit'

let requestObservable: Observable<RequestMessage>

export function startRequestCollection(messageObservable: MessageObservable) {
  if (!requestObservable) {
    requestObservable = new Observable<RequestMessage>()
    trackXhr(requestObservable)
    trackFetch(requestObservable)
  }
  requestObservable.subscribe((message) => messageObservable.notify(message))
}

export function trackXhr(observable: Observable<RequestMessage>) {
  const originalOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = monitor(function(this: XMLHttpRequest, method: string, url: string) {
    const startTime = performance.now()
    const reportXhr = () => {
      observable.notify({
        method,
        startTime,
        duration: performance.now() - startTime,
        requestType: RequestType.XHR,
        response: this.response as string | undefined,
        status: this.status,
        type: MessageType.request,
        url: normalizeUrl(url),
      })
    }

    this.addEventListener('load', monitor(reportXhr))
    this.addEventListener('error', monitor(reportXhr))

    return originalOpen.apply(this, arguments as any)
  })
}

export function trackFetch(observable: Observable<RequestMessage>) {
  if (!window.fetch) {
    return
  }
  const originalFetch = window.fetch
  // tslint:disable promise-function-async
  window.fetch = monitor(function(this: GlobalFetch['fetch'], input: RequestInfo, init?: RequestInit) {
    const method = (init && init.method) || (typeof input === 'object' && input.method) || 'GET'
    const startTime = performance.now()
    const reportFetchError = async (response: Response | Error) => {
      const duration = performance.now() - startTime
      const url = normalizeUrl((typeof input === 'object' && input.url) || (input as string))
      if ('stack' in response) {
        const stackTrace = computeStackTrace(response)
        observable.notify({
          duration,
          method,
          startTime,
          url,
          requestType: RequestType.FETCH,
          response: toStackTraceString(stackTrace),
          status: 0,
          type: MessageType.request,
        })
      } else if ('status' in response) {
        const text = await response.clone().text()
        observable.notify({
          duration,
          method,
          startTime,
          url,
          requestType: RequestType.FETCH,
          response: text,
          status: response.status,
          type: MessageType.request,
        })
      }
    }
    const responsePromise = originalFetch.call(this, input, init)
    responsePromise.then(monitor(reportFetchError), monitor(reportFetchError))
    return responsePromise
  })
}

export function normalizeUrl(url: string) {
  return new URL(url, window.location.origin).href
}

export function isRejected(request: RequestMessage) {
  return request.status === 0
}

export function isServerError(request: RequestMessage) {
  return request.status >= 500
}

import 'url-polyfill'

import { computeStackTrace } from '../tracekit/tracekit'
import { toStackTraceString } from './errorCollection'
import { monitor } from './internalMonitoring'
import { Observable } from './observable'
import { ResourceKind } from './utils'

export enum RequestType {
  FETCH = ResourceKind.FETCH,
  XHR = ResourceKind.XHR,
}

export interface RequestDetails {
  type: RequestType
  method: string
  url: string
  status: number
  response?: string
  startTime: number
  duration: number
}

export type RequestObservable = Observable<RequestDetails>
let requestObservable: Observable<RequestDetails>

export function startRequestCollection() {
  if (!requestObservable) {
    requestObservable = new Observable<RequestDetails>()
    trackXhr(requestObservable)
    trackFetch(requestObservable)
  }
  return requestObservable
}

export function trackXhr(observable: RequestObservable) {
  const originalOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = monitor(function(this: XMLHttpRequest, method: string, url: string) {
    const startTime = performance.now()
    const reportXhr = () => {
      observable.notify({
        method,
        startTime,
        duration: performance.now() - startTime,
        response: this.response as string | undefined,
        status: this.status,
        type: RequestType.XHR,
        url: normalizeUrl(url),
      })
    }

    this.addEventListener('load', monitor(reportXhr))
    this.addEventListener('error', monitor(reportXhr))

    return originalOpen.apply(this, arguments as any)
  })
}

export function trackFetch(observable: RequestObservable) {
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
          response: toStackTraceString(stackTrace),
          status: 0,
          type: RequestType.FETCH,
        })
      } else if ('status' in response) {
        const text = await response.clone().text()
        observable.notify({
          duration,
          method,
          startTime,
          url,
          response: text,
          status: response.status,
          type: RequestType.FETCH,
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

export function isRejected(request: RequestDetails) {
  return request.status === 0
}

export function isServerError(request: RequestDetails) {
  return request.status >= 500
}

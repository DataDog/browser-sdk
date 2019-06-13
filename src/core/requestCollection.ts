import { monitor } from './internalMonitoring'
import { Observable } from './observable'

export type RequestType = 'Fetch' | 'XHR'

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

export function startRequestCollection() {
  const requestObservable = new Observable<RequestDetails>()
  trackXhr(requestObservable)
  trackFetch(requestObservable)
  return requestObservable
}

export function trackXhr(requestObservable: RequestObservable) {
  const originalOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function(method: string, url: string) {
    const startTime = performance.now()
    const reportXhr = () => {
      requestObservable.notify({
        method,
        startTime,
        url,
        duration: performance.now() - startTime,
        response: this.response as string | undefined,
        status: this.status,
        type: 'XHR',
      })
    }

    this.addEventListener('load', monitor(reportXhr))
    this.addEventListener('error', monitor(reportXhr))

    return originalOpen.apply(this, arguments as any)
  }
}

export function trackFetch(requestObservable: RequestObservable) {
  const originalFetch = window.fetch
  // tslint:disable promise-function-async
  window.fetch = function(input: RequestInfo, init?: RequestInit) {
    const method = (init && init.method) || (typeof input === 'object' && input.method) || 'GET'
    const startTime = performance.now()
    const reportFetchError = async (response: Response | Error) => {
      const duration = performance.now() - startTime
      if ('stack' in response) {
        const url = (typeof input === 'object' && input.url) || (input as string)
        requestObservable.notify({
          duration,
          method,
          startTime,
          url,
          response: response.stack,
          status: 0,
          type: 'Fetch',
        })
      } else if ('status' in response) {
        const text = await response.clone().text()
        requestObservable.notify({
          duration,
          method,
          startTime,
          response: text,
          status: response.status,
          type: 'Fetch',
          url: response.url,
        })
      }
    }
    const responsePromise = originalFetch.call(this, input, init)
    responsePromise.then(monitor(reportFetchError), monitor(reportFetchError))
    return responsePromise
  }
}

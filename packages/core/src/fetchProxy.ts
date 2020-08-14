import { toStackTraceString } from './errorCollection'
import { monitor } from './internalMonitoring'
import { computeStackTrace } from './tracekit'
import { normalizeUrl } from './urlPolyfill'

export interface FetchProxy<T extends FetchContext = FetchContext> {
  beforeSend: (callback: (context: Partial<T>) => void) => void
  onRequestComplete: (callback: (context: T) => void) => void
}

export interface FetchContext {
  method: string
  startTime: number
  init?: RequestInit
  duration: number
  url: string
  status: number
  response: string
  error?: {
    name?: string
    message: string
    stack: string
  }
  responseType?: string

  /**
   * allow clients to enhance the context
   */
  [key: string]: unknown
}

let fetchProxySingleton: FetchProxy | undefined
let originalFetch: typeof window.fetch
const beforeSendCallbacks: Array<(fetch: Partial<FetchContext>) => void> = []
const onRequestCompleteCallbacks: Array<(fetch: FetchContext) => void> = []

export function startFetchProxy<T extends FetchContext = FetchContext>(): FetchProxy<T> {
  if (!fetchProxySingleton) {
    proxyFetch()
    fetchProxySingleton = {
      beforeSend(callback: (context: Partial<FetchContext>) => void) {
        beforeSendCallbacks.push(callback)
      },
      onRequestComplete(callback: (context: FetchContext) => void) {
        onRequestCompleteCallbacks.push(callback)
      },
    }
  }
  return fetchProxySingleton as FetchProxy<T>
}

export function resetFetchProxy() {
  if (fetchProxySingleton) {
    fetchProxySingleton = undefined
    beforeSendCallbacks.splice(0, beforeSendCallbacks.length)
    onRequestCompleteCallbacks.splice(0, onRequestCompleteCallbacks.length)
    window.fetch = originalFetch
  }
}

function proxyFetch() {
  if (!window.fetch) {
    return
  }

  originalFetch = window.fetch

  // tslint:disable promise-function-async
  window.fetch = monitor(function(this: WindowOrWorkerGlobalScope['fetch'], input: RequestInfo, init?: RequestInit) {
    const method = (init && init.method) || (typeof input === 'object' && input.method) || 'GET'
    const url = normalizeUrl((typeof input === 'object' && input.url) || (input as string))
    const startTime = performance.now()

    const context: Partial<FetchContext> = {
      init,
      method,
      startTime,
      url,
    }

    const reportFetch = async (response: Response | Error) => {
      context.duration = performance.now() - context.startTime!

      if ('stack' in response || response instanceof Error) {
        const stackTrace = computeStackTrace(response)
        const stackTraceString = toStackTraceString(stackTrace)
        context.status = 0
        context.error = {
          message: stackTrace.message,
          name: stackTrace.name,
          stack: stackTraceString,
        }
        context.response = stackTraceString

        onRequestCompleteCallbacks.forEach((callback) => callback(context as FetchContext))
      } else if ('status' in response) {
        let text: string
        try {
          text = await response.clone().text()
        } catch (e) {
          text = `Unable to retrieve response: ${e}`
        }
        context.response = text
        context.responseType = response.type
        context.status = response.status

        onRequestCompleteCallbacks.forEach((callback) => callback(context as FetchContext))
      }
    }
    beforeSendCallbacks.forEach((callback) => callback(context))

    const responsePromise = originalFetch.call(this, input, context.init)
    responsePromise.then(monitor(reportFetch), monitor(reportFetch))
    return responsePromise
  })
}

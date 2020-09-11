import { toStackTraceString } from './errorCollection'
import { monitor } from './internalMonitoring'
import { computeStackTrace } from './tracekit'
import { normalizeUrl } from './urlPolyfill'

export interface FetchProxy<
  StartContext extends FetchStartContext = FetchStartContext,
  CompleteContext extends FetchCompleteContext = FetchCompleteContext
> {
  beforeSend: (callback: (context: StartContext) => void) => void
  onRequestComplete: (callback: (context: CompleteContext) => void) => void
}

export interface FetchStartContext {
  method: string
  startTime: number
  init?: RequestInit
  url: string

  /**
   * allow clients to enhance the context
   */
  [key: string]: unknown
}

export interface FetchCompleteContext extends FetchStartContext {
  duration: number
  status: number
  response: string
  responseType?: string
}

let fetchProxySingleton: FetchProxy | undefined
let originalFetch: typeof window.fetch
const beforeSendCallbacks: Array<(fetch: FetchStartContext) => void> = []
const onRequestCompleteCallbacks: Array<(fetch: FetchCompleteContext) => void> = []

export function startFetchProxy<
  StartContext extends FetchStartContext = FetchStartContext,
  CompleteContext extends FetchCompleteContext = FetchCompleteContext
>(): FetchProxy<StartContext, CompleteContext> {
  if (!fetchProxySingleton) {
    proxyFetch()
    fetchProxySingleton = {
      beforeSend(callback: (context: FetchStartContext) => void) {
        beforeSendCallbacks.push(callback)
      },
      onRequestComplete(callback: (context: FetchCompleteContext) => void) {
        onRequestCompleteCallbacks.push(callback)
      },
    }
  }
  return fetchProxySingleton as FetchProxy<StartContext, CompleteContext>
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

    const context: FetchStartContext = {
      init,
      method,
      startTime,
      url,
    }

    const reportFetch = async (response: Response | Error) => {
      context.duration = performance.now() - context.startTime!

      if ('stack' in response || response instanceof Error) {
        context.status = 0
        context.response = toStackTraceString(computeStackTrace(response))

        onRequestCompleteCallbacks.forEach((callback) => callback(context as FetchCompleteContext))
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

        onRequestCompleteCallbacks.forEach((callback) => callback(context as FetchCompleteContext))
      }
    }
    beforeSendCallbacks.forEach((callback) => callback(context))

    const responsePromise = originalFetch.call(this, input, context.init)
    responsePromise.then(monitor(reportFetch), monitor(reportFetch))
    return responsePromise
  })
}

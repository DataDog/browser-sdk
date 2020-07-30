import { toStackTraceString } from './errorCollection'
import { monitor } from './internalMonitoring'
import { computeStackTrace } from './tracekit'
import { normalizeUrl } from './urlPolyfill'

export interface FetchProxy {
  beforeSend: (callback: (context: Partial<FetchContext>) => void) => void
  onRequestComplete: (callback: (context: FetchContext) => void) => void
  reset: () => void
}

export interface FetchContext {
  method: string
  startTime: number
  duration: number
  url: string
  status: number
  response: string
  responseType?: string

  /**
   * allow clients to enhance the context
   */
  [key: string]: unknown
}

let originalFetch: typeof window.fetch
let hasBeenStarted = false
const beforeSendCallbacks: Array<(xhr: Partial<FetchContext>) => void> = []
const onRequestCompleteCallbacks: Array<(xhr: FetchContext) => void> = []

export function startFetchProxy(): FetchProxy {
  if (!hasBeenStarted) {
    hasBeenStarted = true
    proxyFetch()
  }
  return {
    beforeSend(callback: (context: Partial<FetchContext>) => void) {
      beforeSendCallbacks.push(callback)
    },
    onRequestComplete(callback: (context: FetchContext) => void) {
      onRequestCompleteCallbacks.push(callback)
    },
    reset() {
      hasBeenStarted = false
      beforeSendCallbacks.splice(0, beforeSendCallbacks.length)
      onRequestCompleteCallbacks.splice(0, onRequestCompleteCallbacks.length)
      window.fetch = originalFetch
    },
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
    const startTime = performance.now()

    const context: Partial<FetchContext> = {
      method,
      startTime,
    }

    const reportFetch = async (response: Response | Error) => {
      context.duration = performance.now() - context.startTime!
      context.url = normalizeUrl((typeof input === 'object' && input.url) || (input as string))

      if ('stack' in response || response instanceof Error) {
        context.status = 0
        context.response = toStackTraceString(computeStackTrace(response))

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

    const responsePromise = originalFetch.call(this, input, init)
    responsePromise.then(monitor(reportFetch), monitor(reportFetch))
    return responsePromise
  })
}

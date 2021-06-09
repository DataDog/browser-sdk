import { monitor, callMonitored } from '../domain/internalMonitoring'
import { computeStackTrace } from '../domain/tracekit'
import { toStackTraceString } from '../tools/error'
import { Duration, elapsed, ClocksState, clocksNow, timeStampNow } from '../tools/timeUtils'
import { normalizeUrl } from '../tools/urlPolyfill'

export interface FetchProxy<
  StartContext extends FetchStartContext = FetchStartContext,
  CompleteContext extends FetchCompleteContext = FetchCompleteContext
> {
  beforeSend: (callback: (context: StartContext) => void) => void
  onRequestComplete: (callback: (context: CompleteContext) => void) => void
}

export interface FetchStartContext {
  method: string
  startClocks: ClocksState
  input: RequestInfo
  init?: RequestInit
  url: string

  /**
   * allow clients to enhance the context
   */
  [key: string]: unknown
}

export interface FetchCompleteContext extends FetchStartContext {
  duration: Duration
  status: number
  response?: Response
  responseText: string
  responseType?: string
  isAborted: boolean
  error?: Error
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

  window.fetch = function (this: WindowOrWorkerGlobalScope['fetch'], input: RequestInfo, init?: RequestInit) {
    let responsePromise: Promise<Response>

    const context = callMonitored(beforeSend, null, [input, init])
    if (context) {
      responsePromise = originalFetch.call(this, context.input, context.init)
      callMonitored(afterSend, null, [responsePromise, context])
    } else {
      responsePromise = originalFetch.call(this, input, init)
    }

    return responsePromise
  }
}

function beforeSend(input: RequestInfo, init?: RequestInit) {
  const method = (init && init.method) || (typeof input === 'object' && input.method) || 'GET'
  const url = normalizeUrl((typeof input === 'object' && input.url) || (input as string))
  const startClocks = clocksNow()

  const context: FetchStartContext = {
    init,
    input,
    method,
    startClocks,
    url,
  }

  beforeSendCallbacks.forEach((callback) => callback(context))

  return context
}

function afterSend(responsePromise: Promise<Response>, context: FetchStartContext & Partial<FetchCompleteContext>) {
  const reportFetch = async (response: Response | Error) => {
    context.duration = elapsed(context.startClocks.timeStamp, timeStampNow())

    if ('stack' in response || response instanceof Error) {
      context.status = 0
      context.responseText = toStackTraceString(computeStackTrace(response))
      context.isAborted = response instanceof DOMException && response.code === DOMException.ABORT_ERR
      context.error = response

      onRequestCompleteCallbacks.forEach((callback) => callback(context as FetchCompleteContext))
    } else if ('status' in response) {
      let text: string
      try {
        text = await response.clone().text()
      } catch (e) {
        text = `Unable to retrieve response: ${e as string}`
      }
      context.response = response
      context.responseText = text
      context.responseType = response.type
      context.status = response.status
      context.isAborted = false

      onRequestCompleteCallbacks.forEach((callback) => callback(context as FetchCompleteContext))
    }
  }
  responsePromise.then(monitor(reportFetch), monitor(reportFetch))
}

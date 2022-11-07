import { instrumentMethod } from '../tools/instrumentMethod'
import { callMonitored, monitor } from '../tools/monitor'
import { Observable } from '../tools/observable'
import type { Duration, ClocksState } from '../tools/timeUtils'
import { elapsed, clocksNow, timeStampNow } from '../tools/timeUtils'
import { normalizeUrl } from '../tools/urlPolyfill'

interface FetchContextBase {
  method: string
  startClocks: ClocksState
  input: RequestInfo
  init?: RequestInit
  url: string
}

export interface FetchStartContext extends FetchContextBase {
  state: 'start'
}

export interface FetchCompleteContext extends FetchContextBase {
  state: 'complete'
  resolveDuration?: Duration
  duration: Duration
  status: number
  response?: Response
  responseType?: string
  isAborted: boolean
  error?: Error
}

export type FetchContext = FetchStartContext | FetchCompleteContext

let fetchObservable: Observable<FetchContext> | undefined

export function initFetchObservable() {
  if (!fetchObservable) {
    fetchObservable = createFetchObservable()
  }
  return fetchObservable
}

function createFetchObservable() {
  const observable = new Observable<FetchContext>(() => {
    if (!window.fetch) {
      return
    }

    const { stop } = instrumentMethod(
      window,
      'fetch',
      (originalFetch) =>
        function (input, init) {
          let responsePromise: Promise<Response>

          const context = callMonitored(beforeSend, null, [observable, input, init])
          if (context) {
            responsePromise = originalFetch.call(this, context.input, context.init)
            callMonitored(afterSend, null, [observable, responsePromise, context])
          } else {
            responsePromise = originalFetch.call(this, input, init)
          }

          return responsePromise
        }
    )

    return stop
  })

  return observable
}

function beforeSend(observable: Observable<FetchContext>, input: RequestInfo, init?: RequestInit) {
  const method = (init && init.method) || (typeof input === 'object' && input.method) || 'GET'
  const url = normalizeUrl((typeof input === 'object' && input.url) || (input as string))
  const startClocks = clocksNow()

  const context: FetchStartContext = {
    state: 'start',
    init,
    input,
    method,
    startClocks,
    url,
  }

  observable.notify(context)

  return context
}

function afterSend(
  observable: Observable<FetchContext>,
  responsePromise: Promise<Response>,
  startContext: FetchStartContext
) {
  const reportFetch = (context: FetchCompleteContext, response: Response | Error) => {
    if ('stack' in response || response instanceof Error) {
      context.status = 0
      context.isAborted = response instanceof DOMException && response.code === DOMException.ABORT_ERR
      context.error = response
    } else if ('status' in response) {
      context.response = response
      context.responseType = response.type
      context.status = response.status
      context.isAborted = false
    }
    observable.notify(context)
  }

  const onFulfilled = (response: Response) => {
    const context = startContext as unknown as FetchCompleteContext
    context.state = 'complete'
    context.resolveDuration = elapsed(context.startClocks.timeStamp, timeStampNow())

    const responseClone = response.clone()
    const reader = responseClone.body?.getReader()

    if (reader && ReadableStream) {
      new ReadableStream({
        start(controller) {
          return pump()

          function pump(): Promise<undefined> {
            return (reader as ReadableStreamDefaultReader<Uint8Array>).read().then(({ done }) => {
              if (done) {
                controller.close()
                context.duration = elapsed(context.startClocks.timeStamp, timeStampNow())
                reportFetch(context, response)
                return
              }
              return pump()
            })
          }
        },
      })
    } else {
      context.duration = elapsed(context.startClocks.timeStamp, timeStampNow())
      reportFetch(context, response)
    }
  }

  const onRejected = (response: Response | Error) => {
    const context = startContext as unknown as FetchCompleteContext
    context.state = 'complete'
    context.duration = elapsed(context.startClocks.timeStamp, timeStampNow())
    reportFetch(context, response)
  }

  responsePromise.then(monitor(onFulfilled), monitor(onRejected))
}

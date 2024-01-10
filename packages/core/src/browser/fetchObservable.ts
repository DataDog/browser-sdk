import { instrumentMethod } from '../tools/instrumentMethod'
import { callMonitored, monitor } from '../tools/monitor'
import { Observable } from '../tools/observable'
import type { ClocksState } from '../tools/utils/timeUtils'
import { clocksNow } from '../tools/utils/timeUtils'
import { normalizeUrl } from '../tools/utils/urlPolyfill'

interface FetchContextBase {
  method: string
  startClocks: ClocksState
  input: unknown
  init?: RequestInit
  url: string
}

export interface FetchStartContext extends FetchContextBase {
  state: 'start'
}

export interface FetchResolveContext extends FetchContextBase {
  state: 'resolve'
  status: number
  response?: Response
  responseType?: string
  isAborted: boolean
  error?: Error
}

export type FetchContext = FetchStartContext | FetchResolveContext

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
            // casting should be `RequestInfo` but node types are ahead of DOM types, making `typecheck test/e2e` fail.
            // it should be resolved with https://github.com/microsoft/TypeScript-DOM-lib-generator/issues/1483
            responsePromise = originalFetch.call(this, context.input as any, context.init)
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

function beforeSend(observable: Observable<FetchContext>, input: unknown, init?: RequestInit) {
  let methodFromParams = init && init.method

  if (methodFromParams === undefined && input instanceof Request) {
    methodFromParams = input.method
  }

  const method = methodFromParams !== undefined ? String(methodFromParams).toUpperCase() : 'GET'
  const url = input instanceof Request ? input.url : normalizeUrl(String(input))
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
  const reportFetch = (response: Response | Error) => {
    const context = startContext as unknown as FetchResolveContext
    context.state = 'resolve'
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

  responsePromise.then(monitor(reportFetch), monitor(reportFetch))
}

import type { InstrumentedMethodCall } from '../tools/instrumentMethod'
import { instrumentMethod } from '../tools/instrumentMethod'
import { monitor } from '../tools/monitor'
import { Observable } from '../tools/observable'
import type { ClocksState } from '../tools/utils/timeUtils'
import { clocksNow } from '../tools/utils/timeUtils'
import { normalizeUrl } from '../tools/utils/urlPolyfill'
import { getGlobalObject } from '../tools/getGlobalObject'

interface FetchContextBase {
  method: string
  startClocks: ClocksState
  input: unknown
  init?: RequestInit
  url: string
  handlingStack?: string
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

export function resetFetchObservable() {
  fetchObservable = undefined
}

function createFetchObservable() {
  return new Observable<FetchContext>((observable) => {
    const globalObject = getGlobalObject<typeof globalThis>()
    
    if (!('fetch' in globalObject)) {
      return
    }

    const { stop } = instrumentMethod(globalObject, 'fetch', (call) => beforeSend(call, observable), {
      computeHandlingStack: true,
    })

    return stop
  })
}

function beforeSend(
  { parameters, onPostCall, handlingStack }: InstrumentedMethodCall<typeof globalThis, 'fetch'>,
  observable: Observable<FetchContext>
) {
  const [input, init] = parameters
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
    handlingStack,
  }

  observable.notify(context)

  // Those properties can be changed by observable subscribers
  parameters[0] = context.input as RequestInfo | URL
  parameters[1] = context.init

  onPostCall((responsePromise) => afterSend(observable, responsePromise, context))
}

function afterSend(
  observable: Observable<FetchContext>,
  responsePromise: Promise<Response>,
  startContext: FetchStartContext
) {
  const context = startContext as unknown as FetchResolveContext

  function reportFetch(partialContext: Partial<FetchResolveContext>) {
    context.state = 'resolve'
    Object.assign(context, partialContext)
    observable.notify(context)
  }

  responsePromise.then(
    monitor((response) => {
      reportFetch({
        response,
        responseType: response.type,
        status: response.status,
        isAborted: false,
      })
    }),
    monitor((error: Error) => {
      reportFetch({
        status: 0,
        isAborted:
          context.init?.signal?.aborted || (error instanceof DOMException && error.code === DOMException.ABORT_ERR),
        error,
      })
    })
  )
}

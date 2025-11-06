import type { InstrumentedMethodCall } from '../tools/instrumentMethod'
import { instrumentMethod } from '../tools/instrumentMethod'
import { monitorError } from '../tools/monitor'
import { Observable } from '../tools/observable'
import type { ClocksState } from '../tools/utils/timeUtils'
import { clocksNow } from '../tools/utils/timeUtils'
import { normalizeUrl } from '../tools/utils/urlPolyfill'
import type { GlobalObject } from '../tools/globalObject'
import { globalObject } from '../tools/globalObject'
import { readBytesFromStream } from '../tools/readBytesFromStream'
import { tryToClone } from '../tools/utils/responseUtils'

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
  responseBody?: string
  responseType?: string
  isAborted: boolean
  error?: Error
}

export type FetchContext = FetchStartContext | FetchResolveContext

type ResponseBodyActionGetter = (context: FetchResolveContext) => ResponseBodyAction

/**
 * Action to take with the response body of a fetch request.
 * Values are ordered by priority: higher values take precedence when multiple actions are requested.
 */
export const enum ResponseBodyAction {
  IGNORE = 0,
  // TODO(next-major): Remove the "WAIT" action when `trackEarlyRequests` is removed, as the
  // duration of fetch requests will always come from PerformanceResourceTiming
  WAIT = 1,
  COLLECT = 2,
}

let fetchObservable: Observable<FetchContext> | undefined
const responseBodyActionGetters: ResponseBodyActionGetter[] = []

export function initFetchObservable({ responseBodyAction }: { responseBodyAction?: ResponseBodyActionGetter } = {}) {
  if (responseBodyAction) {
    responseBodyActionGetters.push(responseBodyAction)
  }
  if (!fetchObservable) {
    fetchObservable = createFetchObservable()
  }
  return fetchObservable
}

export function resetFetchObservable() {
  fetchObservable = undefined
  responseBodyActionGetters.length = 0
}

function createFetchObservable() {
  return new Observable<FetchContext>((observable) => {
    if (!globalObject.fetch) {
      return
    }

    const { stop } = instrumentMethod(globalObject, 'fetch', (call) => beforeSend(call, observable), {
      computeHandlingStack: true,
    })

    return stop
  })
}

function beforeSend(
  { parameters, onPostCall, handlingStack }: InstrumentedMethodCall<GlobalObject, 'fetch'>,
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

  onPostCall((responsePromise) => {
    afterSend(observable, responsePromise, context).catch(monitorError)
  })
}

async function afterSend(
  observable: Observable<FetchContext>,
  responsePromise: Promise<Response>,
  startContext: FetchStartContext
) {
  const context = startContext as unknown as FetchResolveContext
  context.state = 'resolve'

  let response: Response

  try {
    response = await responsePromise
  } catch (error) {
    context.status = 0
    context.isAborted =
      context.init?.signal?.aborted || (error instanceof DOMException && error.code === DOMException.ABORT_ERR)
    context.error = error as Error
    observable.notify(context)
    return
  }

  context.response = response
  context.status = response.status
  context.responseType = response.type
  context.isAborted = false

  const responseBodyCondition = responseBodyActionGetters.reduce(
    (action, getter) => Math.max(action, getter(context)),
    ResponseBodyAction.IGNORE
  ) as ResponseBodyAction

  if (responseBodyCondition !== ResponseBodyAction.IGNORE) {
    const clonedResponse = tryToClone(response)
    if (clonedResponse && clonedResponse.body) {
      try {
        const bytes = await readBytesFromStream(clonedResponse.body, {
          collectStreamBody: responseBodyCondition === ResponseBodyAction.COLLECT,
        })
        context.responseBody = bytes && new TextDecoder().decode(bytes)
      } catch {
        // Ignore errors when reading the response body (e.g., stream aborted, network errors)
        // This is not critical and should not be reported as an SDK error
      }
    }
  }

  observable.notify(context)
}

import type { ClocksState, Duration } from '@datadog/js-core/time'
import { clocksNow, elapsed, toServerDuration } from '@datadog/js-core/time'
import type { InstrumentedMethodCall } from '../tools/instrumentMethod'
import { instrumentMethod } from '../tools/instrumentMethod'
import { monitorError } from '../tools/monitor'
import { Observable } from '../tools/observable'
import { normalizeUrl } from '../tools/utils/urlPolyfill'
import type { GlobalObject } from '../tools/globalObject'
import { globalObject } from '../tools/globalObject'
import { readBytesFromStream } from '../tools/readBytesFromStream'
import { noop } from '../tools/utils/functionUtils'
import { tryToClone } from '../tools/utils/responseUtils'
import type { TimeoutId } from '../tools/timer'
import { setTimeout, clearTimeout } from '../tools/timer'
import type { SseMetadata, SseTrackingEndReason } from '../tools/sse'
import { createSseEventCounter, isSseContentType, SSE_BYTE_LIMIT, SSE_TIME_LIMIT } from '../tools/sse'

interface FetchContextBase {
  method: string
  startClocks: ClocksState
  input: unknown
  init?: RequestInit
  url: string
  handlingStack?: string
  isAbortedOnStart: boolean
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

// Whether the SSE tap should run for this resolved fetch. Injected by RUM so the gate lives there.
type SseActionGetter = (context: FetchResolveContext) => boolean
// Receives SSE counts once the stream ends, delivered out of band from the `resolve` notification.
type SseMetadataListener = (context: FetchResolveContext, sseMetadata: SseMetadata) => void

/**
 * Action to take with the response body of a fetch request.
 * Values are ordered by priority: higher values take precedence when multiple actions are requested.
 */
export const enum ResponseBodyAction {
  IGNORE = 0,
  COLLECT = 1,
}

let fetchObservable: Observable<FetchContext> | undefined
const responseBodyActionGetters: ResponseBodyActionGetter[] = []
const sseActionGetters: SseActionGetter[] = []
const sseMetadataListeners: SseMetadataListener[] = []

export function initFetchObservable({
  responseBodyAction,
  collectSse,
  onSseMetadata,
}: {
  responseBodyAction?: ResponseBodyActionGetter
  collectSse?: SseActionGetter
  onSseMetadata?: SseMetadataListener
} = {}) {
  if (responseBodyAction) {
    responseBodyActionGetters.push(responseBodyAction)
  }
  if (collectSse) {
    sseActionGetters.push(collectSse)
  }
  if (onSseMetadata) {
    sseMetadataListeners.push(onSseMetadata)
  }
  if (!fetchObservable) {
    fetchObservable = createFetchObservable()
  }
  return fetchObservable
}

export function resetFetchObservable() {
  fetchObservable = undefined
  responseBodyActionGetters.length = 0
  sseActionGetters.length = 0
  sseMetadataListeners.length = 0
}

function createFetchObservable() {
  return new Observable<FetchContext>((observable) => {
    // eslint-disable-next-line local-rules/disallow-zone-js-patched-values
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
  let methodFromParams = init?.method

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
    isAbortedOnStart: (input instanceof Request && input.signal?.aborted) || init?.signal?.aborted || false,
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

  let response: Response

  try {
    response = await responsePromise
  } catch (error) {
    observable.notify({
      ...context,
      state: 'resolve',
      status: 0,
      isAborted:
        context.init?.signal?.aborted || (error instanceof DOMException && error.code === DOMException.ABORT_ERR),
      error: error as Error,
    })
    return
  }

  context.response = response
  context.status = response.status
  context.responseType = response.type
  context.isAborted = false

  const responseBodyCondition: ResponseBodyAction = responseBodyActionGetters.reduce<number>(
    (action, getter) => Math.max(action, getter(context)),
    ResponseBodyAction.IGNORE
  )

  if (responseBodyCondition === ResponseBodyAction.COLLECT) {
    const clonedResponse = tryToClone(response)
    if (clonedResponse?.body) {
      try {
        const bytes = await readBytesFromStream(clonedResponse.body)
        context.responseBody = new TextDecoder().decode(bytes)
      } catch {
        // Ignore errors when reading the response body (e.g., stream aborted, network errors)
        // This is not critical and should not be reported as an SDK error
      }
    }
  } else if (
    sseActionGetters.some((getter) => getter(context)) &&
    isSseContentType(response.headers.get('content-type'))
  ) {
    // Read incrementally in the background so resolve (and page-activity) is not held for the
    // stream's lifetime. Counts are delivered to listeners once the stream ends.
    collectSseMetadata(context, response).then((sseMetadata) => {
      if (sseMetadata) {
        sseMetadataListeners.forEach((listener) => listener(context, sseMetadata))
      }
    }, monitorError)
  }

  observable.notify({ ...context, state: 'resolve' })
}

async function collectSseMetadata(context: FetchResolveContext, response: Response): Promise<SseMetadata | undefined> {
  const clonedResponse = tryToClone(response)
  if (!clonedResponse?.body) {
    return
  }

  const reader = clonedResponse.body.getReader()
  const decoder = new TextDecoder('utf-8')
  const counter = createSseEventCounter()

  let bytes = 0
  let lastEventAt: Duration | undefined
  let trackingEndReason: SseTrackingEndReason = 'stream_closed'

  // Cancelling the clone does not disturb the app's own response branch.
  let timedOut = false
  const timeoutId: TimeoutId = setTimeout(() => {
    timedOut = true
    reader.cancel().catch(noop)
  }, SSE_TIME_LIMIT)

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (!value) {
        continue
      }

      bytes += value.byteLength

      // Stop before decoding a chunk that crosses the cap, so a single oversized chunk cannot grow
      // the decoded string or the parser's line buffer past the byte budget.
      if (bytes >= SSE_BYTE_LIMIT) {
        trackingEndReason = 'byte_cap'
        reader.cancel().catch(noop)
        break
      }

      const text = decoder.decode(value, { stream: true })
      if (text) {
        counter.push(text)
        lastEventAt = elapsed(context.startClocks.relative, clocksNow().relative)
      }
    }
    if (timedOut) {
      trackingEndReason = 'time_cap'
    }
  } catch (error) {
    // Stream read errors (abort, network) are not SDK errors; preserve counts gathered so far.
    if (timedOut) {
      trackingEndReason = 'time_cap'
    } else if (context.init?.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      trackingEndReason = 'aborted'
    } else {
      trackingEndReason = 'error'
    }
  } finally {
    clearTimeout(timeoutId)
  }

  return counter.finalize({
    lastEventAt: toServerDuration(lastEventAt),
    endTime: toServerDuration(elapsed(context.startClocks.relative, clocksNow().relative)),
    trackingEndReason,
  })
}

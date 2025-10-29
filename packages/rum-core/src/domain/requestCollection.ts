import type {
  Duration,
  XhrCompleteContext,
  XhrStartContext,
  ClocksState,
  FetchStartContext,
  FetchResolveContext,
  ContextManager,
} from '@datadog/browser-core'
import {
  RequestType,
  initFetchObservable,
  initXhrObservable,
  readBytesFromStream,
  elapsed,
  timeStampNow,
  tryToClone,
} from '@datadog/browser-core'
import type { RumSessionManager } from '..'
import type { RumConfiguration } from './configuration'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import { isAllowedRequestUrl } from './resource/resourceUtils'
import type { Tracer } from './tracing/tracer'
import { startTracer } from './tracing/tracer'
import type { SpanIdentifier, TraceIdentifier } from './tracing/identifier'
import { findGraphQlConfiguration } from './resource/graphql'

export interface CustomContext {
  requestIndex: number
  spanId?: SpanIdentifier
  traceId?: TraceIdentifier
  traceSampled?: boolean
}
export interface RumFetchStartContext extends FetchStartContext, CustomContext {}
export interface RumFetchResolveContext extends FetchResolveContext, CustomContext {
  duration?: Duration
  responseText?: string
}
export interface RumXhrStartContext extends XhrStartContext, CustomContext {}
export interface RumXhrCompleteContext extends XhrCompleteContext, CustomContext {
  responseText?: string
}

export interface RequestStartEvent {
  requestIndex: number
  url: string
}
export interface RequestCompleteEvent {
  requestIndex: number
  type: RequestType
  method: string
  url: string
  status: number
  responseType?: string
  startClocks: ClocksState
  duration: Duration
  spanId?: SpanIdentifier
  traceId?: TraceIdentifier
  traceSampled?: boolean
  xhr?: XMLHttpRequest
  response?: Response
  input?: unknown
  init?: RequestInit
  error?: Error
  isAborted: boolean
  handlingStack?: string
  body?: unknown
  responseText?: string
}

let nextRequestIndex = 1

export function startRequestCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  userContext: ContextManager,
  accountContext: ContextManager
) {
  const tracer = startTracer(configuration, sessionManager, userContext, accountContext)
  trackXhr(lifeCycle, configuration, tracer)
  trackFetch(lifeCycle, configuration, tracer)
}

export function trackXhr(lifeCycle: LifeCycle, configuration: RumConfiguration, tracer: Tracer) {
  const subscription = initXhrObservable(configuration).subscribe((rawContext) => {
    const context = rawContext as RumXhrStartContext | RumXhrCompleteContext
    if (!isAllowedRequestUrl(context.url)) {
      return
    }

    switch (context.state) {
      case 'start':
        tracer.traceXhr(context, context.xhr)
        context.requestIndex = getNextRequestIndex()

        lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, {
          requestIndex: context.requestIndex,
          url: context.url,
        })
        break
      case 'complete':
        extractResponseTextFromXhr(context, configuration)
        tracer.clearTracingIfNeeded(context)
        lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, {
          duration: context.duration,
          method: context.method,
          requestIndex: context.requestIndex,
          spanId: context.spanId,
          startClocks: context.startClocks,
          status: context.status,
          traceId: context.traceId,
          traceSampled: context.traceSampled,
          type: RequestType.XHR,
          url: context.url,
          xhr: context.xhr,
          isAborted: context.isAborted,
          handlingStack: context.handlingStack,
          body: context.body,
          responseText: context.responseText,
        })
        break
    }
  })

  return { stop: () => subscription.unsubscribe() }
}

export function trackFetch(lifeCycle: LifeCycle, configuration: RumConfiguration, tracer: Tracer) {
  const subscription = initFetchObservable().subscribe((rawContext) => {
    const context = rawContext as RumFetchResolveContext | RumFetchStartContext
    if (!isAllowedRequestUrl(context.url)) {
      return
    }

    switch (context.state) {
      case 'start':
        tracer.traceFetch(context)
        context.requestIndex = getNextRequestIndex()

        lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, {
          requestIndex: context.requestIndex,
          url: context.url,
        })
        break
      case 'resolve':
        waitForFetchResponseAndExtractResponseText(context, configuration, () => {
          tracer.clearTracingIfNeeded(context)
          lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, {
            duration: context.duration!,
            method: context.method,
            requestIndex: context.requestIndex,
            responseType: context.responseType,
            spanId: context.spanId,
            startClocks: context.startClocks,
            status: context.status,
            traceId: context.traceId,
            traceSampled: context.traceSampled,
            type: RequestType.FETCH,
            url: context.url,
            response: context.response,
            init: context.init,
            input: context.input,
            isAborted: context.isAborted,
            handlingStack: context.handlingStack,
            body: context.init?.body,
            responseText: context.responseText,
          })
        })
        break
    }
  })
  return { stop: () => subscription.unsubscribe() }
}

function getNextRequestIndex() {
  const result = nextRequestIndex
  nextRequestIndex += 1
  return result
}

function extractResponseTextFromXhr(context: RumXhrCompleteContext, configuration: RumConfiguration) {
  const graphQlConfig = findGraphQlConfiguration(context.url, configuration)
  if (!graphQlConfig?.trackResponseErrors || !context.xhr || typeof context.xhr.response !== 'string') {
    return
  }

  context.responseText = context.xhr.response
}

function waitForFetchResponseAndExtractResponseText(
  context: RumFetchResolveContext,
  configuration: RumConfiguration,
  onComplete: () => void
) {
  const clonedResponse = context.response && tryToClone(context.response)
  if (!clonedResponse || !clonedResponse.body) {
    // do not try to wait for the response if the clone failed, fetch error or null body
    context.duration = elapsed(context.startClocks.timeStamp, timeStampNow())
    onComplete()
    return
  }

  const graphQlConfig = findGraphQlConfiguration(context.url, configuration)
  const shouldCollectResponseText = graphQlConfig?.trackResponseErrors

  readBytesFromStream(
    clonedResponse.body,
    (error?: Error, bytes?: Uint8Array) => {
      context.duration = elapsed(context.startClocks.timeStamp, timeStampNow())

      if (shouldCollectResponseText && !error && bytes) {
        context.responseText = new TextDecoder().decode(bytes)
      }

      onComplete()
    },
    {
      bytesLimit: Number.POSITIVE_INFINITY,
      collectStreamBody: shouldCollectResponseText,
    }
  )
}

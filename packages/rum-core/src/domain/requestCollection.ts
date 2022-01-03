import {
  Duration,
  RequestType,
  initFetchObservable,
  initXhrObservable,
  XhrCompleteContext,
  XhrStartContext,
  ClocksState,
  FetchStartContext,
  FetchCompleteContext,
} from '@datadog/browser-core'
import { RumSessionManager } from '..'
import { RumConfiguration } from './configuration'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { isAllowedRequestUrl } from './rumEventsCollection/resource/resourceUtils'
import { startTracer, TraceIdentifier, Tracer } from './tracing/tracer'

export interface CustomContext {
  requestIndex: number
  spanId?: TraceIdentifier
  traceId?: TraceIdentifier
}
export interface RumFetchStartContext extends FetchStartContext, CustomContext {}
export interface RumFetchCompleteContext extends FetchCompleteContext, CustomContext {}
export interface RumXhrStartContext extends XhrStartContext, CustomContext {}
export interface RumXhrCompleteContext extends XhrCompleteContext, CustomContext {}

export interface RequestStartEvent {
  requestIndex: number
}

export interface RequestCompleteEvent {
  requestIndex: number
  type: RequestType
  method: string
  url: string
  status: number
  responseText?: string
  responseType?: string
  startClocks: ClocksState
  duration: Duration
  spanId?: TraceIdentifier
  traceId?: TraceIdentifier
  xhr?: XMLHttpRequest
  response?: Response
  input?: RequestInfo
  init?: RequestInit
  error?: Error
}

let nextRequestIndex = 1

export function startRequestCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager
) {
  const tracer = startTracer(configuration, sessionManager)
  trackXhr(lifeCycle, configuration, tracer)
  trackFetch(lifeCycle, configuration, tracer)
}

export function trackXhr(lifeCycle: LifeCycle, configuration: RumConfiguration, tracer: Tracer) {
  const subscription = initXhrObservable().subscribe((rawContext) => {
    const context = rawContext as RumXhrStartContext | RumXhrCompleteContext
    if (!isAllowedRequestUrl(configuration, context.url)) {
      return
    }

    switch (context.state) {
      case 'start':
        tracer.traceXhr(context, context.xhr)
        context.requestIndex = getNextRequestIndex()

        lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, {
          requestIndex: context.requestIndex,
        })
        break
      case 'complete':
        tracer.clearTracingIfNeeded(context)
        lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, {
          duration: context.duration,
          method: context.method,
          requestIndex: context.requestIndex,
          responseText: context.responseText,
          spanId: context.spanId,
          startClocks: context.startClocks,
          status: context.status,
          traceId: context.traceId,
          type: RequestType.XHR,
          url: context.url,
          xhr: context.xhr,
        })
        break
    }
  })

  return { stop: () => subscription.unsubscribe() }
}

export function trackFetch(lifeCycle: LifeCycle, configuration: RumConfiguration, tracer: Tracer) {
  const subscription = initFetchObservable().subscribe((rawContext) => {
    const context = rawContext as RumFetchCompleteContext | RumFetchStartContext
    if (!isAllowedRequestUrl(configuration, context.url)) {
      return
    }

    switch (context.state) {
      case 'start':
        tracer.traceFetch(context)
        context.requestIndex = getNextRequestIndex()

        lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, {
          requestIndex: context.requestIndex,
        })
        break
      case 'complete':
        tracer.clearTracingIfNeeded(context)

        lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, {
          duration: context.duration,
          method: context.method,
          requestIndex: context.requestIndex,
          responseText: context.responseText,
          responseType: context.responseType,
          spanId: context.spanId,
          startClocks: context.startClocks,
          status: context.status,
          traceId: context.traceId,
          type: RequestType.FETCH,
          url: context.url,
          response: context.response,
          init: context.init,
          input: context.input,
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

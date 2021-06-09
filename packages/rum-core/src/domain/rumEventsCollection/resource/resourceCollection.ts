import {
  combine,
  generateUUID,
  RequestType,
  ResourceType,
  toServerDuration,
  relativeToClocks,
} from '@datadog/browser-core'
import { RumPerformanceResourceTiming } from '../../../browser/performanceCollection'
import { RawRumResourceEvent, RumEventType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType, RawRumEventCollectedData } from '../../lifeCycle'
import { RequestCompleteEvent } from '../../requestCollection'
import { RumSession } from '../../rumSession'
import { matchRequestTiming } from './matchRequestTiming'
import {
  computePerformanceResourceDetails,
  computePerformanceResourceDuration,
  computeResourceKind,
  computeSize,
  isRequestKind,
} from './resourceUtils'

export function startResourceCollection(lifeCycle: LifeCycle, session: RumSession) {
  lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, (request: RequestCompleteEvent) => {
    if (session.isTrackedWithResource()) {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processRequest(request))
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (session.isTrackedWithResource() && entry.entryType === 'resource' && !isRequestKind(entry)) {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processResourceEntry(entry))
    }
  })
}

function processRequest(request: RequestCompleteEvent): RawRumEventCollectedData<RawRumResourceEvent> {
  const type = request.type === RequestType.XHR ? ResourceType.XHR : ResourceType.FETCH

  const matchingTiming = matchRequestTiming(request)
  const startClocks = matchingTiming ? relativeToClocks(matchingTiming.startTime) : request.startClocks
  const correspondingTimingOverrides = matchingTiming ? computePerformanceEntryMetrics(matchingTiming) : undefined

  const tracingInfo = computeRequestTracingInfo(request)

  const resourceEvent = combine(
    {
      date: startClocks.timeStamp,
      resource: {
        id: generateUUID(),
        type,
        duration: toServerDuration(request.duration),
        method: request.method,
        status_code: request.status,
        url: request.url,
      },
      type: RumEventType.RESOURCE as const,
    },
    tracingInfo,
    correspondingTimingOverrides
  )
  return {
    startTime: startClocks.relative,
    rawRumEvent: resourceEvent,
    domainContext: {
      performanceEntry: matchingTiming instanceof PerformanceEntry ? matchingTiming.toJSON() : matchingTiming,
      xhr: request.xhr,
      fetchResponse: request.response,
      fetchInput: request.input,
      fetchInit: request.init,
      fetchError: request.error,
    },
  }
}

function processResourceEntry(entry: RumPerformanceResourceTiming): RawRumEventCollectedData<RawRumResourceEvent> {
  const type = computeResourceKind(entry)
  const entryMetrics = computePerformanceEntryMetrics(entry)
  const tracingInfo = computeEntryTracingInfo(entry)

  const startClocks = relativeToClocks(entry.startTime)
  const resourceEvent = combine(
    {
      date: startClocks.timeStamp,
      resource: {
        id: generateUUID(),
        type,
        url: entry.name,
      },
      type: RumEventType.RESOURCE as const,
    },
    tracingInfo,
    entryMetrics
  )
  return {
    startTime: startClocks.relative,
    rawRumEvent: resourceEvent,
    domainContext: {
      performanceEntry: (entry as unknown) as PerformanceEntry,
    },
  }
}

function computePerformanceEntryMetrics(timing: RumPerformanceResourceTiming) {
  return {
    resource: {
      duration: computePerformanceResourceDuration(timing),
      size: computeSize(timing),
      ...computePerformanceResourceDetails(timing),
    },
  }
}

function computeRequestTracingInfo(request: RequestCompleteEvent) {
  const hasBeenTraced = request.traceId && request.spanId
  if (!hasBeenTraced) {
    return undefined
  }
  return {
    _dd: {
      span_id: request.spanId!.toDecimalString(),
      trace_id: request.traceId!.toDecimalString(),
    },
  }
}

function computeEntryTracingInfo(entry: RumPerformanceResourceTiming) {
  return entry.traceId ? { _dd: { trace_id: entry.traceId } } : undefined
}

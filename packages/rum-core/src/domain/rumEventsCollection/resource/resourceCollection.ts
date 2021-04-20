import {
  combine,
  generateUUID,
  preferredTimeStamp,
  RequestType,
  ResourceType,
  toServerDuration,
  preferredTime,
  getCorrectedTimeStamp,
} from '@datadog/browser-core'
import { RumPerformanceResourceTiming } from '../../../browser/performanceCollection'
import { RawRumResourceEvent, RumEventType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
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

function processRequest(request: RequestCompleteEvent) {
  const type = request.type === RequestType.XHR ? ResourceType.XHR : ResourceType.FETCH

  const matchingTiming = matchRequestTiming(request)
  const startTime = matchingTiming
    ? preferredTime(getCorrectedTimeStamp(matchingTiming.startTime), matchingTiming.startTime)
    : request.startTime
  const correspondingTimingOverrides = matchingTiming ? computePerformanceEntryMetrics(matchingTiming) : undefined

  const tracingInfo = computeRequestTracingInfo(request)

  const resourceEvent = combine(
    {
      date: preferredTimeStamp(startTime),
      resource: {
        type,
        duration: toServerDuration(request.duration),
        method: request.method,
        status_code: request.status,
        url: request.url,
      },
      type: RumEventType.RESOURCE,
    },
    tracingInfo,
    correspondingTimingOverrides
  )
  return { startTime, rawRumEvent: resourceEvent as RawRumResourceEvent }
}

function processResourceEntry(entry: RumPerformanceResourceTiming) {
  const type = computeResourceKind(entry)
  const entryMetrics = computePerformanceEntryMetrics(entry)
  const tracingInfo = computeEntryTracingInfo(entry)

  const time = preferredTime(getCorrectedTimeStamp(entry.startTime), entry.startTime)
  const resourceEvent = combine(
    {
      date: preferredTimeStamp(time),
      resource: {
        type,
        url: entry.name,
      },
      type: RumEventType.RESOURCE,
    },
    tracingInfo,
    entryMetrics
  )
  return { startTime: time, rawRumEvent: resourceEvent as RawRumResourceEvent }
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
    resource: { id: generateUUID() },
  }
}

function computeEntryTracingInfo(entry: RumPerformanceResourceTiming) {
  return entry.traceId ? { _dd: { trace_id: entry.traceId } } : undefined
}

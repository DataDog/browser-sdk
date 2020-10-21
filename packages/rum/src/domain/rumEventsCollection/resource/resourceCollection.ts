import {
  combine,
  Configuration,
  generateUUID,
  getTimestamp,
  msToNs,
  RequestType,
  ResourceType,
} from '@datadog/browser-core'
import { RumPerformanceResourceTiming } from '../../../browser/performanceCollection'
import { RumEventCategory, RumResourceEvent } from '../../../types'
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

export function startResourceCollection(lifeCycle: LifeCycle, configuration: Configuration, session: RumSession) {
  lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, (request: RequestCompleteEvent) => {
    if (session.isTrackedWithResource()) {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processRequest(request))
      lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (session.isTrackedWithResource() && entry.entryType === 'resource' && !isRequestKind(entry)) {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processResourceEntry(entry))
      lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    }
  })
}

function processRequest(request: RequestCompleteEvent) {
  const kind = request.type === RequestType.XHR ? ResourceType.XHR : ResourceType.FETCH

  const matchingTiming = matchRequestTiming(request)
  const startTime = matchingTiming ? matchingTiming.startTime : request.startTime
  const correspondingTimingOverrides = matchingTiming ? computePerformanceEntryMetrics(matchingTiming) : undefined

  const tracingInfo = computeRequestTracingInfo(request)

  const resourceEvent: RumResourceEvent = combine(
    {
      date: getTimestamp(startTime),
      duration: msToNs(request.duration),
      evt: {
        category: RumEventCategory.RESOURCE as const,
      },
      http: {
        method: request.method,
        statusCode: request.status,
        url: request.url,
      },
      resource: {
        kind,
      },
    },
    tracingInfo,
    correspondingTimingOverrides
  )
  return { startTime, rawRumEvent: resourceEvent }
}

function processResourceEntry(entry: RumPerformanceResourceTiming) {
  const resourceKind = computeResourceKind(entry)
  const entryMetrics = computePerformanceEntryMetrics(entry)
  const tracingInfo = computeEntryTracingInfo(entry)

  const resourceEvent: RumResourceEvent = combine(
    {
      date: getTimestamp(entry.startTime),
      evt: {
        category: RumEventCategory.RESOURCE as const,
      },
      http: {
        url: entry.name,
      },
      resource: {
        kind: resourceKind,
      },
    },
    tracingInfo,
    entryMetrics
  )
  return { startTime: entry.startTime, rawRumEvent: resourceEvent }
}

function computePerformanceEntryMetrics(timing: RumPerformanceResourceTiming) {
  return {
    duration: computePerformanceResourceDuration(timing),
    http: {
      performance: computePerformanceResourceDetails(timing),
    },
    network: {
      bytesWritten: computeSize(timing),
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
      spanId: request.spanId!.toDecimalString(),
      traceId: request.traceId!.toDecimalString(),
    },
    resource: { id: generateUUID() },
  }
}

function computeEntryTracingInfo(entry: RumPerformanceResourceTiming) {
  return entry.traceId ? { _dd: { traceId: entry.traceId } } : undefined
}

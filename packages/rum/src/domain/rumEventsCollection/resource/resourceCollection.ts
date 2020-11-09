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
import { RumEventType, RumResourceEventV2 } from '../../../typesV2'
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
      configuration.isEnabled('v2_format')
        ? lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, processRequestV2(request))
        : lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processRequest(request))
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (session.isTrackedWithResource() && entry.entryType === 'resource' && !isRequestKind(entry)) {
      configuration.isEnabled('v2_format')
        ? lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, processResourceEntryV2(entry))
        : lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processResourceEntry(entry))
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

function processRequestV2(request: RequestCompleteEvent) {
  const type = request.type === RequestType.XHR ? ResourceType.XHR : ResourceType.FETCH

  const matchingTiming = matchRequestTiming(request)
  const startTime = matchingTiming ? matchingTiming.startTime : request.startTime
  const correspondingTimingOverrides = matchingTiming ? computePerformanceEntryMetricsV2(matchingTiming) : undefined

  const tracingInfo = computeRequestTracingInfo(request)

  const resourceEvent = combine(
    {
      date: getTimestamp(startTime),
      resource: {
        type,
        duration: msToNs(request.duration),
        method: request.method,
        statusCode: request.status,
        url: request.url,
      },
      type: RumEventType.RESOURCE,
    },
    tracingInfo,
    correspondingTimingOverrides
  )
  return { startTime, rawRumEvent: resourceEvent as RumResourceEventV2 }
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

function processResourceEntryV2(entry: RumPerformanceResourceTiming) {
  const type = computeResourceKind(entry)
  const entryMetrics = computePerformanceEntryMetricsV2(entry)
  const tracingInfo = computeEntryTracingInfo(entry)

  const resourceEvent = combine(
    {
      date: getTimestamp(entry.startTime),
      resource: {
        type,
        url: entry.name,
      },
      type: RumEventType.RESOURCE,
    },
    tracingInfo,
    entryMetrics
  )
  return { startTime: entry.startTime, rawRumEvent: resourceEvent as RumResourceEventV2 }
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

function computePerformanceEntryMetricsV2(timing: RumPerformanceResourceTiming) {
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
      spanId: request.spanId!.toDecimalString(),
      traceId: request.traceId!.toDecimalString(),
    },
    resource: { id: generateUUID() },
  }
}

function computeEntryTracingInfo(entry: RumPerformanceResourceTiming) {
  return entry.traceId ? { _dd: { traceId: entry.traceId } } : undefined
}

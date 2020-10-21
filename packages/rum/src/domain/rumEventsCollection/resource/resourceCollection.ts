import {
  Configuration,
  generateUUID,
  getTimestamp,
  includes,
  msToNs,
  RequestType,
  ResourceType,
} from '@datadog/browser-core'
import { RumPerformanceResourceTiming } from '../../../browser/performanceCollection'
import { RawRumEvent, RumEventCategory, RumResourceEvent } from '../../../types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { RequestCompleteEvent } from '../../requestCollection'
import { RumSession } from '../../rumSession'
import {
  computePerformanceResourceDetails,
  computePerformanceResourceDuration,
  computeResourceKind,
  computeSize,
} from '../resourceUtils'
import { matchRequestTiming } from './matchRequestTiming'

export function startResourceCollection(lifeCycle: LifeCycle, configuration: Configuration, session: RumSession) {
  const handler = (startTime: number, rawRumEvent: RawRumEvent) =>
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      rawRumEvent,
      startTime,
    })
  lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, (request: RequestCompleteEvent) => {
    handleRequest(lifeCycle, session, handler, request)
  })

  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (entry.entryType === 'resource') {
      handleResourceEntry(lifeCycle, session, handler, entry)
    }
  })
}

function handleRequest(
  lifeCycle: LifeCycle,
  session: RumSession,
  handler: (startTime: number, event: RumResourceEvent) => void,
  request: RequestCompleteEvent
) {
  if (!session.isTrackedWithResource()) {
    return
  }
  const timing = matchRequestTiming(request)
  const kind = request.type === RequestType.XHR ? ResourceType.XHR : ResourceType.FETCH
  const startTime = timing ? timing.startTime : request.startTime
  const hasBeenTraced = request.traceId && request.spanId
  handler(startTime, {
    _dd: hasBeenTraced
      ? {
          spanId: request.spanId!.toDecimalString(),
          traceId: request.traceId!.toDecimalString(),
        }
      : undefined,
    date: getTimestamp(startTime),
    duration: timing ? computePerformanceResourceDuration(timing) : msToNs(request.duration),
    evt: {
      category: RumEventCategory.RESOURCE,
    },
    http: {
      method: request.method,
      performance: timing ? computePerformanceResourceDetails(timing) : undefined,
      statusCode: request.status,
      url: request.url,
    },
    network: {
      bytesWritten: timing ? computeSize(timing) : undefined,
    },
    resource: {
      kind,
      id: hasBeenTraced ? generateUUID() : undefined,
    },
  })
  lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
}

function handleResourceEntry(
  lifeCycle: LifeCycle,
  session: RumSession,
  handler: (startTime: number, event: RumResourceEvent) => void,
  entry: RumPerformanceResourceTiming
) {
  if (!session.isTrackedWithResource()) {
    return
  }
  const resourceKind = computeResourceKind(entry)
  if (includes([ResourceType.XHR, ResourceType.FETCH], resourceKind)) {
    return
  }
  handler(entry.startTime, {
    _dd: entry.traceId
      ? {
          traceId: entry.traceId,
        }
      : undefined,
    date: getTimestamp(entry.startTime),
    duration: computePerformanceResourceDuration(entry),
    evt: {
      category: RumEventCategory.RESOURCE,
    },
    http: {
      performance: computePerformanceResourceDetails(entry),
      url: entry.name,
    },
    network: {
      bytesWritten: computeSize(entry),
    },
    resource: {
      kind: resourceKind,
    },
  })
  lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
}

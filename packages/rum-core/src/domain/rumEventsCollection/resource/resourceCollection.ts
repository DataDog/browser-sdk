import {
  combine,
  generateUUID,
  RequestType,
  ResourceType,
  toServerDuration,
  relativeToClocks,
  assign,
  isNumber,
  addTelemetryDebug,
  elapsed,
  timeStampNow,
} from '@datadog/browser-core'
import type { ClocksState, Observable } from '@datadog/browser-core'
import type { RumConfiguration } from '../../configuration'
import type { RumPerformanceEntry, RumPerformanceResourceTiming } from '../../../browser/performanceCollection'
import type {
  PerformanceEntryRepresentation,
  RumXhrResourceEventDomainContext,
  RumFetchResourceEventDomainContext,
} from '../../../domainContext.types'
import type { RawRumResourceEvent } from '../../../rawRumEvent.types'
import { RumEventType } from '../../../rawRumEvent.types'
import type { LifeCycle, RawRumEventCollectedData } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import type { RequestCompleteEvent } from '../../requestCollection'
import type { RumSessionManager } from '../../rumSessionManager'
import {
  computePerformanceResourceDetails,
  computePerformanceResourceDuration,
  computeResourceKind,
  computeSize,
  isRequestKind,
  toValidEntry,
} from './resourceUtils'

import { filterEntries } from './filterEntries'

export function startResourceCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  performanceObserver: Observable<PerformanceEntry[]>
) {
  lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, (request: RequestCompleteEvent) => {
    const { unsubscribe } = performanceObserver.subscribe((entries) => {
      const matchingTimings = filterEntries(entries, request)

      if (matchingTimings.length > 0) {
        if (matchingTimings.length > 1) addTelemetryDebug('Multiple performance entries matched')
        const matchingTiming = matchingTimings[matchingTimings.length - 1]

        lifeCycle.notify(
          LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
          processRequest(
            request,
            configuration,
            sessionManager,
            toValidEntry(matchingTiming) ? matchingTiming : undefined
          )
        )
        unsubscribe()
      }
    })
  })

  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    for (const entry of entries) {
      if (entry.entryType === 'resource' && !isRequestKind(entry)) {
        lifeCycle.notify(
          LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
          processResourceEntry(entry, configuration, sessionManager)
        )
      }
    }
  })
}

function processRequest(
  request: RequestCompleteEvent,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  matchingTiming: RumPerformanceResourceTiming | undefined
): RawRumEventCollectedData<RawRumResourceEvent> {
  const type = request.type === RequestType.XHR ? ResourceType.XHR : ResourceType.FETCH

  const startClocks = matchingTiming ? relativeToClocks(matchingTiming.startTime) : request.startClocks
  const correspondingTimingOverrides = matchingTiming ? computePerformanceEntryMetrics(matchingTiming) : undefined

  const tracingInfo = computeRequestTracingInfo(request, configuration)
  const indexingInfo = computeIndexingInfo(sessionManager, startClocks)

  // "Duration" is not set when request is of type fetch. In that case we create
  // a new duration variable based on the current time stamp.
  //
  // Why?
  // This duration takes into account the response + payload time into account; unlike
  // before where it did not take into account the payload download time. Measuring duration using
  // JS is never going to be perfectly accurate thus why we favour correspondingTimingOverrides
  // generated from matchingTiming (aka PerformanceEntries).
  const duration = request.duration ? request.duration : elapsed(request.startClocks.timeStamp, timeStampNow())

  const resourceEvent = combine(
    {
      date: startClocks.timeStamp,
      resource: {
        id: generateUUID(),
        type,
        duration: toServerDuration(duration),
        method: request.method,
        status_code: request.status,
        url: request.url,
      },
      _dd: {
        resolveDuration: request.resolveDuration ? toServerDuration(request.resolveDuration) : undefined,
      },
      type: RumEventType.RESOURCE as const,
    },
    tracingInfo,
    correspondingTimingOverrides,
    indexingInfo
  )
  return {
    startTime: startClocks.relative,
    rawRumEvent: resourceEvent,
    domainContext: {
      performanceEntry: matchingTiming && toPerformanceEntryRepresentation(matchingTiming),
      xhr: request.xhr,
      response: request.response,
      requestInput: request.input,
      requestInit: request.init,
      error: request.error,
    } as RumFetchResourceEventDomainContext | RumXhrResourceEventDomainContext,
  }
}

function processResourceEntry(
  entry: RumPerformanceResourceTiming,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager
): RawRumEventCollectedData<RawRumResourceEvent> {
  const type = computeResourceKind(entry)
  const entryMetrics = computePerformanceEntryMetrics(entry)
  const startClocks = relativeToClocks(entry.startTime)

  const tracingInfo = computeEntryTracingInfo(entry, configuration)
  const indexingInfo = computeIndexingInfo(sessionManager, startClocks)

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
    entryMetrics,
    indexingInfo
  )
  return {
    startTime: startClocks.relative,
    rawRumEvent: resourceEvent,
    domainContext: {
      performanceEntry: toPerformanceEntryRepresentation(entry),
    },
  }
}

function computePerformanceEntryMetrics(timing: RumPerformanceResourceTiming) {
  return {
    resource: assign(
      {
        duration: computePerformanceResourceDuration(timing),
        size: computeSize(timing),
      },
      computePerformanceResourceDetails(timing)
    ),
  }
}

function computeRequestTracingInfo(request: RequestCompleteEvent, configuration: RumConfiguration) {
  const hasBeenTraced = request.traceSampled && request.traceId && request.spanId
  if (!hasBeenTraced) {
    return undefined
  }
  return {
    _dd: {
      span_id: request.spanId!.toDecimalString(),
      trace_id: request.traceId!.toDecimalString(),
      rule_psr: getRulePsr(configuration),
    },
  }
}

function computeEntryTracingInfo(entry: RumPerformanceResourceTiming, configuration: RumConfiguration) {
  const hasBeenTraced = entry.traceId
  if (!hasBeenTraced) {
    return undefined
  }
  return {
    _dd: {
      trace_id: entry.traceId,
      rule_psr: getRulePsr(configuration),
    },
  }
}

// TODO next major: use directly PerformanceEntry type in domain context
function toPerformanceEntryRepresentation(entry: RumPerformanceEntry): PerformanceEntryRepresentation {
  return entry as PerformanceEntryRepresentation
}

/**
 * @returns number between 0 and 1 which represents tracing sample rate
 */
function getRulePsr(configuration: RumConfiguration) {
  return isNumber(configuration.tracingSampleRate) ? configuration.tracingSampleRate / 100 : undefined
}

function computeIndexingInfo(sessionManager: RumSessionManager, resourceStart: ClocksState) {
  const session = sessionManager.findTrackedSession(resourceStart.relative)
  return {
    _dd: {
      discarded: !session || !session.resourceAllowed,
    },
  }
}

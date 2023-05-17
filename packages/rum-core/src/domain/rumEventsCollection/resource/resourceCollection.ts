import {
  combine,
  generateUUID,
  RequestType,
  ResourceType,
  toServerDuration,
  relativeToClocks,
  assign,
  isNumber,
  isExperimentalFeatureEnabled,
  ExperimentalFeature,
} from '@datadog/browser-core'
import type { ClocksState, Duration } from '@datadog/browser-core'
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
import type { PageStateHistory } from '../../contexts/pageStateHistory'
import { PageState } from '../../contexts/pageStateHistory'
import { matchRequestTiming } from './matchRequestTiming'
import {
  computePerformanceResourceDetails,
  computePerformanceResourceDuration,
  computeResourceKind,
  computeSize,
  isRequestKind,
} from './resourceUtils'

export function startResourceCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  pageStateHistory: PageStateHistory
) {
  lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, (request: RequestCompleteEvent) => {
    lifeCycle.notify(
      LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
      processRequest(request, configuration, sessionManager, pageStateHistory)
    )
  })

  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    for (const entry of entries) {
      if (entry.entryType === 'resource' && !isRequestKind(entry)) {
        lifeCycle.notify(
          LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
          processResourceEntry(entry, configuration, sessionManager, pageStateHistory)
        )
      }
    }
  })
}

function processRequest(
  request: RequestCompleteEvent,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  pageStateHistory: PageStateHistory
): RawRumEventCollectedData<RawRumResourceEvent> {
  const type = request.type === RequestType.XHR ? ResourceType.XHR : ResourceType.FETCH

  const matchingTiming = matchRequestTiming(request)
  const startClocks = matchingTiming ? relativeToClocks(matchingTiming.startTime) : request.startClocks
  const correspondingTimingOverrides = matchingTiming ? computePerformanceEntryMetrics(matchingTiming) : undefined

  const tracingInfo = computeRequestTracingInfo(request, configuration)
  const indexingInfo = computeIndexingInfo(sessionManager, startClocks)

  const duration = computeRequestDuration(pageStateHistory, startClocks, request.duration)
  const pageStateInfo = computePageStateInfo(
    pageStateHistory,
    startClocks,
    matchingTiming?.duration ?? request.duration
  )

  const resourceEvent = combine(
    {
      date: startClocks.timeStamp,
      resource: {
        id: generateUUID(),
        type,
        duration,
        method: request.method,
        status_code: request.status,
        url: request.url,
      },
      type: RumEventType.RESOURCE as const,
    },
    tracingInfo,
    correspondingTimingOverrides,
    indexingInfo,
    pageStateInfo
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
  sessionManager: RumSessionManager,
  pageStateHistory: PageStateHistory
): RawRumEventCollectedData<RawRumResourceEvent> {
  const type = computeResourceKind(entry)
  const entryMetrics = computePerformanceEntryMetrics(entry)
  const startClocks = relativeToClocks(entry.startTime)

  const tracingInfo = computeEntryTracingInfo(entry, configuration)
  const indexingInfo = computeIndexingInfo(sessionManager, startClocks)
  const pageStateInfo = computePageStateInfo(pageStateHistory, startClocks, entry.duration)

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
    indexingInfo,
    pageStateInfo
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
 * @returns number between 0 and 1 which represents trace sample rate
 */
function getRulePsr(configuration: RumConfiguration) {
  return isNumber(configuration.traceSampleRate) ? configuration.traceSampleRate / 100 : undefined
}

function computeIndexingInfo(sessionManager: RumSessionManager, resourceStart: ClocksState) {
  const session = sessionManager.findTrackedSession(resourceStart.relative)
  return {
    _dd: {
      discarded: !session || !session.resourceAllowed,
    },
  }
}

function computePageStateInfo(pageStateHistory: PageStateHistory, startClocks: ClocksState, duration: Duration) {
  if (!isExperimentalFeatureEnabled(ExperimentalFeature.RESOURCE_PAGE_STATES)) {
    return
  }

  return {
    _dd: {
      page_states: pageStateHistory.findAll(startClocks.relative, duration),
      page_was_discarded: String((document as any).wasDiscarded),
    },
  }
}

function computeRequestDuration(pageStateHistory: PageStateHistory, startClocks: ClocksState, duration: Duration) {
  // TODO remove FF in next major
  if (!isExperimentalFeatureEnabled(ExperimentalFeature.NO_RESOURCE_DURATION_FROZEN_STATE)) {
    return toServerDuration(duration)
  }

  const requestCrossedFrozenState = pageStateHistory
    .findAll(startClocks.relative, duration)
    ?.some((pageState) => pageState.state === PageState.FROZEN)

  return !requestCrossedFrozenState ? toServerDuration(duration) : undefined
}

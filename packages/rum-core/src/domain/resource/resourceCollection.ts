import type { ClocksState, Duration } from '@datadog/browser-core'
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
import type { RumConfiguration } from '../configuration'
import type { RumPerformanceResourceTiming } from '../../browser/performanceCollection'
import { RumPerformanceEntryType } from '../../browser/performanceCollection'
import type { RumXhrResourceEventDomainContext, RumFetchResourceEventDomainContext } from '../../domainContext.types'
import type { RawRumResourceEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import { LifeCycleEventType } from '../lifeCycle'
import type { RawRumEventCollectedData, LifeCycle } from '../lifeCycle'
import type { RequestCompleteEvent } from '../requestCollection'
import type { RumSessionManager } from '../rumSessionManager'
import type { PageStateHistory } from '../contexts/pageStateHistory'
import { PageState } from '../contexts/pageStateHistory'
import { matchRequestTiming } from './matchRequestTiming'
import {
  computePerformanceResourceDetails,
  computePerformanceResourceDuration,
  computeResourceKind,
  computeSize,
  isRequestKind,
  isLongDataUrl,
  sanitizeDataUrl,
} from './resourceUtils'

export function startResourceCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  pageStateHistory: PageStateHistory
) {
  lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, (request: RequestCompleteEvent) => {
    const rawEvent = processRequest(request, configuration, sessionManager, pageStateHistory)
    if (rawEvent) {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rawEvent)
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    for (const entry of entries) {
      if (entry.entryType === RumPerformanceEntryType.RESOURCE && !isRequestKind(entry)) {
        const rawEvent = processResourceEntry(entry, configuration, sessionManager, pageStateHistory)
        if (rawEvent) {
          lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rawEvent)
        }
      }
    }
  })
}

function processRequest(
  request: RequestCompleteEvent,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  pageStateHistory: PageStateHistory
): RawRumEventCollectedData<RawRumResourceEvent> | undefined {
  const matchingTiming = matchRequestTiming(request)
  const startClocks = matchingTiming ? relativeToClocks(matchingTiming.startTime) : request.startClocks
  const shouldIndex = shouldIndexResource(configuration, sessionManager, startClocks)
  const tracingInfo = computeRequestTracingInfo(request, configuration)
  if (!shouldIndex && !tracingInfo) {
    return
  }

  const type = request.type === RequestType.XHR ? ResourceType.XHR : ResourceType.FETCH

  const correspondingTimingOverrides = matchingTiming ? computePerformanceEntryMetrics(matchingTiming) : undefined

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
        url: isLongDataUrl(request.url) ? sanitizeDataUrl(request.url) : request.url,
      },
      type: RumEventType.RESOURCE as const,
      _dd: {
        discarded: !shouldIndex,
      },
    },
    tracingInfo,
    correspondingTimingOverrides,
    pageStateInfo
  )
  const collectedData = {
    startTime: startClocks.relative,
    rawRumEvent: resourceEvent,
    domainContext: {
      performanceEntry: matchingTiming,
      xhr: request.xhr,
      response: request.response,
      requestInput: request.input,
      requestInit: request.init,
      error: request.error,
      isAborted: request.isAborted,
    } as RumFetchResourceEventDomainContext | RumXhrResourceEventDomainContext,
  }

  if (isExperimentalFeatureEnabled(ExperimentalFeature.MICRO_FRONTEND)) {
    collectedData.domainContext.handlingStack = request.handlingStack
  }

  return collectedData
}

function processResourceEntry(
  entry: RumPerformanceResourceTiming,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  pageStateHistory: PageStateHistory
): RawRumEventCollectedData<RawRumResourceEvent> | undefined {
  const startClocks = relativeToClocks(entry.startTime)
  const shouldIndex = shouldIndexResource(configuration, sessionManager, startClocks)
  const tracingInfo = computeEntryTracingInfo(entry, configuration)
  if (!shouldIndex && !tracingInfo) {
    return
  }

  const type = computeResourceKind(entry)
  const entryMetrics = computePerformanceEntryMetrics(entry)

  const pageStateInfo = computePageStateInfo(pageStateHistory, startClocks, entry.duration)

  const resourceEvent = combine(
    {
      date: startClocks.timeStamp,
      resource: {
        id: generateUUID(),
        type,
        url: entry.name,
        status_code: discardZeroStatus(entry.responseStatus),
      },
      type: RumEventType.RESOURCE as const,
      _dd: {
        discarded: !shouldIndex,
      },
    },
    tracingInfo,
    entryMetrics,
    pageStateInfo
  )
  return {
    startTime: startClocks.relative,
    rawRumEvent: resourceEvent,
    domainContext: {
      performanceEntry: entry,
    },
  }
}

function shouldIndexResource(
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  resourceStart: ClocksState
) {
  return configuration.trackResources && sessionManager.findTrackedSession(resourceStart.relative)
}

function computePerformanceEntryMetrics(timing: RumPerformanceResourceTiming) {
  const { renderBlockingStatus } = timing
  return {
    resource: assign(
      {
        duration: computePerformanceResourceDuration(timing),
        render_blocking_status: renderBlockingStatus,
      },
      computeSize(timing),
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

/**
 * @returns number between 0 and 1 which represents trace sample rate
 */
function getRulePsr(configuration: RumConfiguration) {
  return isNumber(configuration.traceSampleRate) ? configuration.traceSampleRate / 100 : undefined
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
  return !pageStateHistory.wasInPageStateDuringPeriod(PageState.FROZEN, startClocks.relative, duration)
    ? toServerDuration(duration)
    : undefined
}

/**
 * The status is 0 for cross-origin resources without CORS headers, so the status is meaningless, and we shouldn't report it
 * https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/responseStatus#cross-origin_response_status_codes
 */
function discardZeroStatus(statusCode: number | undefined): number | undefined {
  return statusCode === 0 ? undefined : statusCode
}

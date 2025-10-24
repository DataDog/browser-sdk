import type { ClocksState, Duration } from '@datadog/browser-core'
import {
  combine,
  generateUUID,
  RequestType,
  ResourceType,
  toServerDuration,
  relativeToClocks,
  createTaskQueue,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import type { RumPerformanceResourceTiming } from '../../browser/performanceObservable'
import { RumPerformanceEntryType, createPerformanceObservable } from '../../browser/performanceObservable'
import type {
  RumXhrResourceEventDomainContext,
  RumFetchResourceEventDomainContext,
  RumOtherResourceEventDomainContext,
} from '../../domainContext.types'
import type { RawRumResourceEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData, LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { RequestCompleteEvent } from '../requestCollection'
import type { PageStateHistory } from '../contexts/pageStateHistory'
import { PageState } from '../contexts/pageStateHistory'
import { createSpanIdentifier } from '../tracing/identifier'
import { matchRequestResourceEntry } from './matchRequestResourceEntry'
import {
  computeResourceEntryDetails,
  computeResourceEntryDuration,
  computeResourceEntryType,
  computeResourceEntrySize,
  computeResourceEntryProtocol,
  computeResourceEntryDeliveryType,
  isResourceEntryRequestType,
  sanitizeIfLongDataUrl,
} from './resourceUtils'
import { retrieveInitialDocumentResourceTiming } from './retrieveInitialDocumentResourceTiming'
import type { RequestRegistry } from './requestRegistry'
import { createRequestRegistry } from './requestRegistry'
import type { GraphQlMetadata } from './graphql'
import { extractGraphQlMetadata, findGraphQlConfiguration } from './graphql'

export function startResourceCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  pageStateHistory: PageStateHistory,
  taskQueue = createTaskQueue(),
  retrieveInitialDocumentResourceTimingImpl = retrieveInitialDocumentResourceTiming
) {
  let requestRegistry: RequestRegistry | undefined
  const isEarlyRequestCollectionEnabled = configuration.trackEarlyRequests

  if (isEarlyRequestCollectionEnabled) {
    requestRegistry = createRequestRegistry(lifeCycle)
  } else {
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, (request: RequestCompleteEvent) => {
      handleResource(() => processRequest(request, configuration, pageStateHistory))
    })
  }

  const performanceResourceSubscription = createPerformanceObservable(configuration, {
    type: RumPerformanceEntryType.RESOURCE,
    buffered: true,
  }).subscribe((entries) => {
    for (const entry of entries) {
      if (isEarlyRequestCollectionEnabled || !isResourceEntryRequestType(entry)) {
        handleResource(() => processResourceEntry(entry, configuration, pageStateHistory, requestRegistry))
      }
    }
  })

  retrieveInitialDocumentResourceTimingImpl(configuration, (timing) => {
    handleResource(() => processResourceEntry(timing, configuration, pageStateHistory, requestRegistry))
  })

  function handleResource(computeRawEvent: () => RawRumEventCollectedData<RawRumResourceEvent> | undefined) {
    taskQueue.push(() => {
      const rawEvent = computeRawEvent()
      if (rawEvent) {
        lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rawEvent)
      }
    })
  }

  return {
    stop: () => {
      taskQueue.stop()
      performanceResourceSubscription.unsubscribe()
    },
  }
}

function processRequest(
  request: RequestCompleteEvent,
  configuration: RumConfiguration,
  pageStateHistory: PageStateHistory
): RawRumEventCollectedData<RawRumResourceEvent> | undefined {
  const matchingTiming = matchRequestResourceEntry(request)
  return assembleResource(matchingTiming, request, pageStateHistory, configuration)
}

function processResourceEntry(
  entry: RumPerformanceResourceTiming,
  configuration: RumConfiguration,
  pageStateHistory: PageStateHistory,
  requestRegistry: RequestRegistry | undefined
): RawRumEventCollectedData<RawRumResourceEvent> | undefined {
  const matchingRequest =
    isResourceEntryRequestType(entry) && requestRegistry ? requestRegistry.getMatchingRequest(entry) : undefined
  return assembleResource(entry, matchingRequest, pageStateHistory, configuration)
}

// TODO: In the future, the `entry` parameter should be required, making things simpler.
function assembleResource(
  entry: RumPerformanceResourceTiming | undefined,
  request: RequestCompleteEvent | undefined,
  pageStateHistory: PageStateHistory,
  configuration: RumConfiguration
): RawRumEventCollectedData<RawRumResourceEvent> | undefined {
  if (!entry && !request) {
    return
  }

  const tracingInfo = request
    ? computeRequestTracingInfo(request, configuration)
    : computeResourceEntryTracingInfo(entry!, configuration)
  if (!configuration.trackResources && !tracingInfo) {
    return
  }

  const startClocks = entry ? relativeToClocks(entry.startTime) : request!.startClocks
  const duration = entry
    ? computeResourceEntryDuration(entry)
    : computeRequestDuration(pageStateHistory, startClocks, request!.duration)

  const graphql = request && computeGraphQlMetaData(request, configuration)

  const resourceEvent = combine(
    {
      date: startClocks.timeStamp,
      resource: {
        id: generateUUID(),
        duration: toServerDuration(duration),
        // TODO: in the future when `entry` is required, we can probably only rely on `computeResourceEntryType`
        type: request
          ? request.type === RequestType.XHR
            ? ResourceType.XHR
            : ResourceType.FETCH
          : computeResourceEntryType(entry!),
        method: request ? request.method : undefined,
        status_code: request ? request.status : discardZeroStatus(entry!.responseStatus),
        url: request ? sanitizeIfLongDataUrl(request.url) : entry!.name,
        protocol: entry && computeResourceEntryProtocol(entry),
        delivery_type: entry && computeResourceEntryDeliveryType(entry),
        graphql,
      },
      type: RumEventType.RESOURCE,
      _dd: {
        discarded: !configuration.trackResources,
      },
    },
    tracingInfo,
    entry && computeResourceEntryMetrics(entry)
  )

  return {
    startTime: startClocks.relative,
    duration,
    rawRumEvent: resourceEvent,
    domainContext: getResourceDomainContext(entry, request),
  }
}

function computeGraphQlMetaData(
  request: RequestCompleteEvent,
  configuration: RumConfiguration
): GraphQlMetadata | undefined {
  const graphQlConfig = findGraphQlConfiguration(request.url, configuration)
  if (!graphQlConfig) {
    return
  }

  return extractGraphQlMetadata(request, graphQlConfig)
}

function getResourceDomainContext(
  entry: RumPerformanceResourceTiming | undefined,
  request: RequestCompleteEvent | undefined
): RumFetchResourceEventDomainContext | RumXhrResourceEventDomainContext | RumOtherResourceEventDomainContext {
  if (request) {
    const baseDomainContext = {
      performanceEntry: entry,
      isAborted: request.isAborted,
      handlingStack: request.handlingStack,
    }

    if (request.type === RequestType.XHR) {
      return {
        xhr: request.xhr!,
        ...baseDomainContext,
      }
    }
    return {
      requestInput: request.input as RequestInfo,
      requestInit: request.init,
      response: request.response,
      error: request.error,
      ...baseDomainContext,
    }
  }
  return {
    // Currently, at least one of `entry` or `request` must be defined when calling this function.
    // So `entry` is guaranteed to be defined here. In the future, when `entry` is required, we can
    // remove the `!` assertion.
    performanceEntry: entry!,
  }
}

function computeResourceEntryMetrics(entry: RumPerformanceResourceTiming) {
  const { renderBlockingStatus } = entry
  return {
    resource: {
      render_blocking_status: renderBlockingStatus,
      ...computeResourceEntrySize(entry),
      ...computeResourceEntryDetails(entry),
    },
  }
}

function computeRequestTracingInfo(request: RequestCompleteEvent, configuration: RumConfiguration) {
  const hasBeenTraced = request.traceSampled && request.traceId && request.spanId
  if (!hasBeenTraced) {
    return undefined
  }
  return {
    _dd: {
      span_id: request.spanId!.toString(),
      trace_id: request.traceId!.toString(),
      rule_psr: configuration.rulePsr,
    },
  }
}

function computeResourceEntryTracingInfo(entry: RumPerformanceResourceTiming, configuration: RumConfiguration) {
  const hasBeenTraced = entry.traceId
  if (!hasBeenTraced) {
    return undefined
  }
  return {
    _dd: {
      trace_id: entry.traceId,
      span_id: createSpanIdentifier().toString(),
      rule_psr: configuration.rulePsr,
    },
  }
}

function computeRequestDuration(pageStateHistory: PageStateHistory, startClocks: ClocksState, duration: Duration) {
  return !pageStateHistory.wasInPageStateDuringPeriod(PageState.FROZEN, startClocks.relative, duration)
    ? duration
    : undefined
}

/**
 * The status is 0 for cross-origin resources without CORS headers, so the status is meaningless, and we shouldn't report it
 * https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/responseStatus#cross-origin_response_status_codes
 */
function discardZeroStatus(statusCode: number | undefined): number | undefined {
  return statusCode === 0 ? undefined : statusCode
}

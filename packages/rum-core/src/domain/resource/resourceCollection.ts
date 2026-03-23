import type { ClocksState, Duration, MatchOption } from '@datadog/browser-core'
import {
  combine,
  generateUUID,
  RequestType,
  ResourceType,
  toServerDuration,
  relativeToClocks,
  createTaskQueue,
  mockable,
  isExperimentalFeatureEnabled,
  ExperimentalFeature,
  matchList,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import type { RumPerformanceResourceTiming } from '../../browser/performanceObservable'
import { RumPerformanceEntryType, createPerformanceObservable } from '../../browser/performanceObservable'
import type {
  RumXhrResourceEventDomainContext,
  RumFetchResourceEventDomainContext,
  RumOtherResourceEventDomainContext,
} from '../../domainContext.types'
import type { NetworkHeaders, RawRumResourceEvent, ResourceRequest, ResourceResponse } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData, LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { RequestCompleteEvent } from '../requestCollection'
import type { PageStateHistory } from '../contexts/pageStateHistory'
import { PageState } from '../contexts/pageStateHistory'
import { createSpanIdentifier } from '../tracing/identifier'
import { startEventTracker } from '../eventTracker'
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
import type { ManualResourceData } from './trackManualResources'
import { trackManualResources } from './trackManualResources'

export function startResourceCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  pageStateHistory: PageStateHistory
) {
  const taskQueue = mockable(createTaskQueue)()
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

  mockable(retrieveInitialDocumentResourceTiming)(configuration, (timing) => {
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

  const resourceTracker = startEventTracker<ManualResourceData>(lifeCycle)
  const manualResources = trackManualResources(lifeCycle, resourceTracker)

  return {
    startResource: manualResources.startResource,
    stopResource: manualResources.stopResource,
    stop: () => {
      taskQueue.stop()
      performanceResourceSubscription.unsubscribe()
      resourceTracker.stopAll()
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

  const networkHeaders = isExperimentalFeatureEnabled(ExperimentalFeature.TRACK_RESOURCE_HEADERS)
    ? computeNetworkHeaders(request, configuration)
    : undefined

  const graphql = request && computeGraphQlMetaData(request, configuration)
  const response = entry && computeResourceResponse(entry)

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
        response,
      },
      type: RumEventType.RESOURCE,
      _dd: {
        discarded: !configuration.trackResources,
      },
    },
    tracingInfo,
    entry && computeResourceEntryMetrics(entry),
    networkHeaders
  )

  return {
    startClocks,
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

function computeResourceResponse(entry: RumPerformanceResourceTiming): ResourceResponse | undefined {
  const contentType = entry.contentType

  if (contentType) {
    return {
      headers: {
        'content-type': contentType,
      },
    }
  }

  return undefined
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

function computeNetworkHeaders(
  request: RequestCompleteEvent | undefined,
  configuration: RumConfiguration
): { resource: { request?: ResourceRequest; response?: ResourceResponse } } | undefined {
  const matchers = configuration.trackResourceHeaders
  if (matchers.length === 0 || !request) {
    return undefined
  }

  const responseHeaders = getResponseHeaders(request, matchers)
  const requestHeaders = getRequestHeaders(request, matchers)

  if (!responseHeaders && !requestHeaders) {
    return undefined
  }

  return {
    resource: {
      request: requestHeaders ? { headers: requestHeaders } : undefined,
      response: responseHeaders ? { headers: responseHeaders } : undefined,
    },
  }
}

function getResponseHeaders(request: RequestCompleteEvent, matchers: MatchOption[]): NetworkHeaders | undefined {
  if (request.type === RequestType.FETCH && request.response) {
    return filterHeaders(request.response.headers, matchers)
  }

  if (request.type === RequestType.XHR && request.xhr) {
    const rawHeaders = request.xhr.getAllResponseHeaders()
    if (rawHeaders) {
      try {
        return filterHeaders(new Headers(parseRawHeaders(rawHeaders)), matchers)
      } catch {
        // Ignore parsing errors
      }
    }
  }

  return undefined
}

function getRequestHeaders(request: RequestCompleteEvent, matchers: MatchOption[]): NetworkHeaders | undefined {
  if (request.type !== RequestType.FETCH) {
    return undefined
  }

  let headers: Headers | undefined

  if (request.init?.headers) {
    try {
      headers = new Headers(request.init.headers)
    } catch {
      // Ignore invalid headers
    }
  } else if (request.input instanceof Request) {
    headers = request.input.headers
  }

  return headers ? filterHeaders(headers, matchers) : undefined
}

function filterHeaders(headers: Headers, matchers: MatchOption[]): NetworkHeaders | undefined {
  const result: NetworkHeaders = {} as NetworkHeaders
  let hasHeaders = false

  headers.forEach((value, name) => {
    const lowerName = name.toLowerCase()
    if (matchList(matchers, lowerName)) {
      result[lowerName] = value
      hasHeaders = true
    }
  })

  return hasHeaders ? result : undefined
}

function parseRawHeaders(rawHeaders: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  const lines = rawHeaders.trim().split(/\r?\n/)
  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      pairs.push([line.substring(0, colonIndex).trim(), line.substring(colonIndex + 1).trim()])
    }
  }
  return pairs
}

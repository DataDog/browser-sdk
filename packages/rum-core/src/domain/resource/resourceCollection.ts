import {
  combine,
  generateUUID,
  toServerDuration,
  relativeToClocks,
  createTaskQueue,
  mockable,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import type { RumPerformanceResourceTiming } from '../../browser/performanceObservable'
import { RumPerformanceEntryType, createPerformanceObservable } from '../../browser/performanceObservable'
import type { RumResourceEventDomainContext } from '../../domainContext.types'
import type { RawRumResourceEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData, LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { RequestCompleteEvent } from '../requestCollection'
import { createSpanIdentifier } from '../tracing/identifier'
import { startEventTracker } from '../eventTracker'
import {
  computeResourceEntryDuration,
  computeResourceEntryType,
  computeResourceEntryProtocol,
  computeResourceEntryDeliveryType,
  isResourceEntryRequestType,
  sanitizeIfLongDataUrl,
  computeResourceEntrySize,
  computeResourceEntryDetails,
} from './resourceUtils'
import { retrieveInitialDocumentResourceTiming } from './retrieveInitialDocumentResourceTiming'
import type { RequestRegistry } from './requestRegistry'
import { createRequestRegistry } from './requestRegistry'
import type { GraphQlMetadata } from './graphql'
import { extractGraphQlMetadata, findGraphQlConfiguration } from './graphql'
import type { ManualResourceData } from './trackManualResources'
import { trackManualResources } from './trackManualResources'

export function startResourceCollection(lifeCycle: LifeCycle, configuration: RumConfiguration) {
  const taskQueue = mockable(createTaskQueue)()
  const requestRegistry = createRequestRegistry(lifeCycle)

  const performanceResourceSubscription = createPerformanceObservable(configuration, {
    type: RumPerformanceEntryType.RESOURCE,
    buffered: true,
  }).subscribe((entries) => {
    for (const entry of entries) {
      handleResource(() => assembleResource(entry, requestRegistry, configuration))
    }
  })

  mockable(retrieveInitialDocumentResourceTiming)(configuration, (timing) => {
    handleResource(() => assembleResource(timing, requestRegistry, configuration))
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

function assembleResource(
  entry: RumPerformanceResourceTiming,
  requestRegistry: RequestRegistry,
  configuration: RumConfiguration
): RawRumEventCollectedData<RawRumResourceEvent> | undefined {
  const request = isResourceEntryRequestType(entry) ? requestRegistry.getMatchingRequest(entry) : undefined
  const tracingInfo = request
    ? computeRequestTracingInfo(request, configuration)
    : computeResourceEntryTracingInfo(entry, configuration)
  if (!configuration.trackResources && !tracingInfo) {
    return
  }

  const startClocks = relativeToClocks(entry.startTime)
  const duration = computeResourceEntryDuration(entry)

  const resourceEvent = combine(
    {
      date: startClocks.timeStamp,
      resource: {
        id: generateUUID(),
        duration: toServerDuration(duration),
        type: computeResourceEntryType(entry),
        method: request?.method,
        status_code: request ? request.status : discardZeroStatus(entry.responseStatus),
        url: request ? sanitizeIfLongDataUrl(request.url) : entry.name,
        protocol: computeResourceEntryProtocol(entry),
        delivery_type: computeResourceEntryDeliveryType(entry),
        graphql: request && computeGraphQlMetaData(request, configuration),
        render_blocking_status: entry.renderBlockingStatus,
        ...computeResourceEntrySize(entry),
        ...computeResourceEntryDetails(entry),
      },
      type: RumEventType.RESOURCE,
      _dd: {
        discarded: !configuration.trackResources,
      },
    },
    tracingInfo
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

function getResourceDomainContext(
  entry: RumPerformanceResourceTiming,
  request: RequestCompleteEvent | undefined
): RumResourceEventDomainContext {
  return {
    performanceEntry: entry,
    isManual: false,
    isAborted: request ? request.isAborted : false,
    handlingStack: request?.handlingStack,
    requestInit: request?.init,
    requestInput: request?.input as RequestInfo | undefined,
    response: request?.response,
    error: request?.error,
    xhr: request?.xhr,
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

/**
 * The status is 0 for cross-origin resources without CORS headers, so the status is meaningless, and we shouldn't report it
 * https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/responseStatus#cross-origin_response_status_codes
 */
function discardZeroStatus(statusCode: number | undefined): number | undefined {
  return statusCode === 0 ? undefined : statusCode
}

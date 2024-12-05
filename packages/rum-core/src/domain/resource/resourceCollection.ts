import type { ClocksState, Duration } from '@datadog/browser-core'
import {
  combine,
  generateUUID,
  RequestType,
  ResourceType,
  toServerDuration,
  relativeToClocks,
  assign,
  createTaskQueue,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import {
  RumPerformanceEntryType,
  createPerformanceObservable,
  type RumPerformanceResourceTiming,
} from '../../browser/performanceObservable'
import type { RumXhrResourceEventDomainContext, RumFetchResourceEventDomainContext } from '../../domainContext.types'
import type { RawRumResourceEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import { LifeCycleEventType } from '../lifeCycle'
import type { RawRumEventCollectedData, LifeCycle } from '../lifeCycle'
import type { RequestCompleteEvent } from '../requestCollection'
import type { PageStateHistory } from '../contexts/pageStateHistory'
import { PageState } from '../contexts/pageStateHistory'
import { createTraceIdentifier } from '../tracing/tracer'
import { matchRequestResourceEntry } from './matchRequestResourceEntry'
import {
  computeResourceEntryDetails,
  computeResourceEntryDuration,
  computeResourceEntryType,
  computeResourceEntrySize,
  computeResourceEntryProtocol,
  computeResourceEntryDeliveryType,
  isResourceEntryRequestType,
  isLongDataUrl,
  sanitizeDataUrl,
} from './resourceUtils'
import { retrieveInitialDocumentResourceTiming } from './retrieveInitialDocumentResourceTiming'

export function startResourceCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  pageStateHistory: PageStateHistory,
  taskQueue = createTaskQueue(),
  retrieveInitialDocumentResourceTimingImpl = retrieveInitialDocumentResourceTiming
) {
  lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, (request: RequestCompleteEvent) => {
    handleResource(() => processRequest(request, configuration, pageStateHistory))
  })

  const performanceResourceSubscription = createPerformanceObservable(configuration, {
    type: RumPerformanceEntryType.RESOURCE,
    buffered: true,
  }).subscribe((entries) => {
    for (const entry of entries) {
      if (!isResourceEntryRequestType(entry)) {
        handleResource(() => processResourceEntry(entry, configuration))
      }
    }
  })

  retrieveInitialDocumentResourceTimingImpl(configuration, (timing) => {
    handleResource(() => processResourceEntry(timing, configuration))
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
  const startClocks = matchingTiming ? relativeToClocks(matchingTiming.startTime) : request.startClocks
  const tracingInfo = computeRequestTracingInfo(request, configuration)
  if (!configuration.trackResources && !tracingInfo) {
    return
  }

  const type = request.type === RequestType.XHR ? ResourceType.XHR : ResourceType.FETCH

  const correspondingTimingOverrides = matchingTiming ? computeResourceEntryMetrics(matchingTiming) : undefined

  const duration = computeRequestDuration(pageStateHistory, startClocks, request.duration)

  const resourceEvent = combine(
    {
      date: startClocks.timeStamp,
      resource: {
        id: generateUUID(),
        type,
        duration,
        method: request.method,
        status_code: request.status,
        protocol: matchingTiming && computeResourceEntryProtocol(matchingTiming),
        url: isLongDataUrl(request.url) ? sanitizeDataUrl(request.url) : request.url,
        delivery_type: matchingTiming && computeResourceEntryDeliveryType(matchingTiming),
      },
      type: RumEventType.RESOURCE as const,
      _dd: {
        discarded: !configuration.trackResources,
      },
    },
    tracingInfo,
    correspondingTimingOverrides
  )

  return {
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
      handlingStack: request.handlingStack,
    } as RumFetchResourceEventDomainContext | RumXhrResourceEventDomainContext,
  }
}

function processResourceEntry(
  entry: RumPerformanceResourceTiming,
  configuration: RumConfiguration
): RawRumEventCollectedData<RawRumResourceEvent> | undefined {
  const startClocks = relativeToClocks(entry.startTime)
  const tracingInfo = computeResourceEntryTracingInfo(entry, configuration)
  if (!configuration.trackResources && !tracingInfo) {
    return
  }

  const type = computeResourceEntryType(entry)
  const entryMetrics = computeResourceEntryMetrics(entry)

  const resourceEvent = combine(
    {
      date: startClocks.timeStamp,
      resource: {
        id: generateUUID(),
        type,
        url: entry.name,
        status_code: discardZeroStatus(entry.responseStatus),
        protocol: computeResourceEntryProtocol(entry),
        delivery_type: computeResourceEntryDeliveryType(entry),
      },
      type: RumEventType.RESOURCE as const,
      _dd: {
        discarded: !configuration.trackResources,
      },
    },
    tracingInfo,
    entryMetrics
  )
  return {
    startTime: startClocks.relative,
    rawRumEvent: resourceEvent,
    domainContext: {
      performanceEntry: entry,
    },
  }
}

function computeResourceEntryMetrics(entry: RumPerformanceResourceTiming) {
  const { renderBlockingStatus } = entry
  return {
    resource: assign(
      {
        duration: computeResourceEntryDuration(entry),
        render_blocking_status: renderBlockingStatus,
      },
      computeResourceEntrySize(entry),
      computeResourceEntryDetails(entry)
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
      span_id: createTraceIdentifier().toDecimalString(),
      rule_psr: configuration.rulePsr,
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

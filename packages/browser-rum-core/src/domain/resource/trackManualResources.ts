import type { ResourceType } from '@datadog/browser-core'
import type { Context } from '@datadog/js-core/util'
import { elapsed, toServerDuration, clocksNow } from '@datadog/js-core/time'
import { ResourceType as ResourceTypeEnum } from '@datadog/browser-core'
import type { RawRumResourceEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { EventTracker } from '../eventTracker'
import { sanitizeIfLongDataUrl } from './resourceUtils'

interface ResourceOptionsBase {
  /**
   * Resource context
   */
  context?: Context

  /**
   * Resource key
   */
  resourceKey?: string

  /**
   * [Internal option] APM trace id of the resource
   *
   * @internal
   */
  traceId?: string

  /**
   * [Internal option] APM span id of the resource
   *
   * @internal
   */
  spanId?: string

  /**
   * [Internal option] APM trace sampling rate of the resource
   *
   * @internal
   */
  rulePsr?: number
}

export interface ResourceOptions extends ResourceOptionsBase {
  /**
   * Resource type
   *
   * @default 'other'
   */
  type?: ResourceType

  /**
   * HTTP method
   */
  method?: string
}

export interface ResourceStopOptions extends ResourceOptionsBase {
  /**
   * Resource type
   */
  type?: ResourceType

  /**
   * HTTP status code
   */
  statusCode?: number

  /**
   * Resource size in bytes
   */
  size?: number
}

export interface ManualResourceData extends ResourceOptionsBase {
  url: string
  type?: ResourceType
  method?: string
}

export function trackManualResources(lifeCycle: LifeCycle, resourceTracker: EventTracker<ManualResourceData>) {
  function startManualResource(url: string, options: ResourceOptions = {}, startClocks = clocksNow()) {
    const lookupKey = options.resourceKey ?? url

    resourceTracker.start(lookupKey, startClocks, {
      url,
      ...options,
    })
  }

  function stopManualResource(url: string, options: ResourceStopOptions = {}, stopClocks = clocksNow()) {
    const lookupKey = options.resourceKey ?? url

    const stopped = resourceTracker.stop(lookupKey, stopClocks, {
      context: options.context,
      traceId: options.traceId,
      spanId: options.spanId,
      rulePsr: options.rulePsr,
      type: options.type,
    })

    if (!stopped) {
      return
    }

    const duration = elapsed(stopped.startClocks.relative, stopClocks.relative)

    const { traceId, spanId, rulePsr } = stopped

    const rawRumEvent: RawRumResourceEvent = {
      date: stopped.startClocks.timeStamp,
      type: RumEventType.RESOURCE,
      resource: {
        id: stopped.id,
        type: stopped.type || ResourceTypeEnum.OTHER,
        url: sanitizeIfLongDataUrl(stopped.url),
        duration: toServerDuration(duration),
        method: stopped.method,
        status_code: options.statusCode,
        size: options.size,
      },
      _dd:
        typeof traceId === 'string' && traceId && typeof spanId === 'string' && spanId
          ? { trace_id: traceId, span_id: spanId, ...(typeof rulePsr === 'number' && { rule_psr: rulePsr }) }
          : {},
      context: stopped.context,
    }

    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      rawRumEvent,
      startClocks: stopped.startClocks,
      duration,
      domainContext: { isManual: true },
    })
  }

  return {
    startResource: startManualResource,
    stopResource: stopManualResource,
  }
}

import type { ClocksState, Context, ResourceType } from '@datadog/browser-core'
import { clocksNow, elapsed, ResourceType as ResourceTypeEnum, toServerDuration } from '@datadog/browser-core'
import type { RawRumResourceEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { EventTracker } from '../eventTracker'
import { sanitizeIfLongDataUrl } from './resourceUtils'

export interface ResourceOptions {
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

  /**
   * Resource context
   */
  context?: Context

  /**
   * Resource key
   */
  resourceKey?: string
}

export interface ResourceStopOptions {
  /**
   * Resource type
   */
  type?: ResourceType

  /**
   * HTTP status code
   */
  statusCode?: number

  /**
   * Resource context
   */
  context?: Context

  /**
   * Resource key
   */
  resourceKey?: string
}

export interface ManualResourceData {
  url: string
  type?: ResourceType
  method?: string
  context?: Context
}

export function trackManualResources(lifeCycle: LifeCycle, resourceTracker: EventTracker<ManualResourceData>) {
  function emitResource(
    id: string,
    startClocks: ClocksState,
    data: ManualResourceData,
    statusCode?: number,
    endClocks?: ClocksState
  ) {
    const duration = endClocks ? elapsed(startClocks.relative, endClocks.relative) : undefined

    const rawRumEvent: RawRumResourceEvent = {
      date: startClocks.timeStamp,
      type: RumEventType.RESOURCE,
      resource: {
        id,
        type: data.type || ResourceTypeEnum.OTHER,
        url: sanitizeIfLongDataUrl(data.url),
        duration: duration !== undefined ? toServerDuration(duration) : undefined,
        method: data.method,
        status_code: statusCode,
      },
      _dd: {},
      context: data.context,
    }

    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      rawRumEvent,
      startClocks,
      duration,
      domainContext: { isManual: true as const },
    })
  }

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
      type: options.type,
    })

    if (!stopped) {
      return
    }

    emitResource(stopped.id, stopped.startClocks, stopped, options.statusCode, stopClocks)
  }

  return {
    startResource: startManualResource,
    stopResource: stopManualResource,
  }
}

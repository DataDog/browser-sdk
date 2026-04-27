import type { Context, ResourceType } from '@datadog/browser-core'
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
   * Resource size in bytes
   */
  size?: number

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

    const duration = elapsed(stopped.startClocks.relative, stopClocks.relative)

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
      _dd: {},
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

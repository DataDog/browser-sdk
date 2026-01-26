import type { Context, ResourceType } from '@datadog/browser-core'
import { clocksNow, generateUUID, ResourceType as ResourceTypeEnum, toServerDuration } from '@datadog/browser-core'
import type { RawRumResourceEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { createManualEventLifecycle } from '../manualEventRegistry'

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

interface ManualResourceStart {
  url: string
  type?: ResourceType
  method?: string
  context?: Context
}

export function trackManualResources(lifeCycle: LifeCycle) {
  const lifecycle = createManualEventLifecycle<ManualResourceStart>(lifeCycle)

  function startManualResource(url: string, options: ResourceOptions = {}, startClocks = clocksNow()) {
    const lookupKey = options.resourceKey ?? url

    lifecycle.add(lookupKey, startClocks, {
      url,
      type: options.type,
      method: options.method,
      context: options.context,
    })
  }

  function stopManualResource(url: string, options: ResourceStopOptions = {}, stopClocks = clocksNow()) {
    const lookupKey = options.resourceKey ?? url

    const activeResource = lifecycle.remove(lookupKey, stopClocks, { context: options.context })

    if (!activeResource) {
      return
    }

    const rawRumEvent: RawRumResourceEvent = {
      date: activeResource.startClocks.timeStamp,
      type: RumEventType.RESOURCE,
      resource: {
        id: generateUUID(),
        type: activeResource.type || ResourceTypeEnum.OTHER,
        url: activeResource.url,
        duration: toServerDuration(activeResource.duration),
        method: activeResource.method,
        status_code: options.statusCode,
      },
      _dd: {},
      context: activeResource.context,
    }

    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      rawRumEvent,
      startTime: activeResource.startClocks.relative,
      duration: activeResource.duration,
      domainContext: { isManual: true as const },
    })
  }

  function stop() {
    lifecycle.stopAll()
  }

  return {
    startResource: startManualResource,
    stopResource: stopManualResource,
    stop,
  }
}

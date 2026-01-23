import type { ClocksState, Context, Duration, ResourceType } from '@datadog/browser-core'
import {
  clocksNow,
  combine,
  elapsed,
  generateUUID,
  ResourceType as ResourceTypeEnum,
  toServerDuration,
} from '@datadog/browser-core'
import type { RawRumResourceEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { LifeCycle, RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { createManualEventLifecycle } from '../manualEventLifecycle'

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

export interface ManualResource {
  id: string
  url: string
  type: ResourceType
  method?: string
  startClocks: ClocksState
  duration: Duration
  statusCode?: number
  context?: Context
}

interface ManualResourceStart {
  url: string
  type?: ResourceType
  method?: string
  context?: Context
  startClocks: ClocksState
}

export function trackManualResources(lifeCycle: LifeCycle) {
  const lifecycle = createManualEventLifecycle<ManualResourceStart>(lifeCycle)

  function startManualResource(url: string, options: ResourceOptions = {}, startClocks = clocksNow()) {
    const lookupKey = options.resourceKey ?? url

    lifecycle.start(lookupKey, {
      url,
      type: options.type,
      method: options.method,
      context: options.context,
      startClocks,
    })
  }

  function stopManualResource(url: string, options: ResourceStopOptions = {}, stopClocks = clocksNow()) {
    const lookupKey = options.resourceKey ?? url
    const activeResource = lifecycle.remove(lookupKey)

    if (!activeResource) {
      return
    }

    const duration = elapsed(activeResource.startClocks.relative, stopClocks.relative)

    const manualResource: ManualResource = {
      id: generateUUID(),
      url: activeResource.url,
      type: activeResource.type || ResourceTypeEnum.OTHER,
      method: activeResource.method,
      startClocks: activeResource.startClocks,
      duration,
      statusCode: options.statusCode,
      context: combine(activeResource.context, options.context),
    }

    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processResource(manualResource))
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

function processResource(resource: ManualResource): RawRumEventCollectedData<RawRumResourceEvent> {
  const rawRumEvent: RawRumResourceEvent = {
    date: resource.startClocks.timeStamp,
    type: RumEventType.RESOURCE,
    resource: {
      id: resource.id,
      type: resource.type,
      url: resource.url,
      duration: toServerDuration(resource.duration),
      method: resource.method,
      status_code: resource.statusCode,
    },
    _dd: {
      discarded: false,
    },
    context: resource.context,
  } as RawRumResourceEvent

  return {
    rawRumEvent,
    startTime: resource.startClocks.relative,
    duration: resource.duration,
    domainContext: { isManual: true as const },
  }
}

import type { Context, ResourceType } from '@datadog/browser-core'
import { elapsed, toServerDuration, clocksNow } from '@datadog/js-core/time'
import { RequestType, ResourceType as ResourceTypeEnum } from '@datadog/browser-core'
import type { RawRumResourceEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { EventTracker } from '../eventTracker'
import { getNextRequestIndex } from '../requestCollection'
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
  requestIndex: number
}

export function trackManualResources(lifeCycle: LifeCycle, resourceTracker: EventTracker<ManualResourceData>) {
  function startManualResource(url: string, options: ResourceOptions = {}, startClocks = clocksNow()) {
    const lookupKey = options.resourceKey ?? url
    const requestIndex = getNextRequestIndex()

    resourceTracker.start(lookupKey, startClocks, {
      url,
      requestIndex,
      ...options,
    })

    // Prototype note (electron-sdk IPC RUM events, 2026-08): manual resources always participate in
    // pending-activity tracking. Revisit with the browser-sdk team whether this should be opt-in before
    // shipping outside the prototype — existing public API callers get new behavior unconditionally.
    lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, { requestIndex, url })
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

    // Prototype note (electron-sdk IPC RUM events, 2026-08): manual resources always participate in
    // pending-activity tracking. Revisit with the browser-sdk team whether this should be opt-in before
    // shipping outside the prototype — existing public API callers get new behavior unconditionally.
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, {
      requestIndex: stopped.requestIndex,
      type: RequestType.OTHER,
      method: stopped.method ?? '',
      url: stopped.url,
      status: options.statusCode ?? 0,
      startClocks: stopped.startClocks,
      duration,
      isAborted: false,
      isAbortedOnStart: false,
    })
  }

  return {
    startResource: startManualResource,
    stopResource: stopManualResource,
  }
}

import type { ClocksState, Context, ResourceType } from '@datadog/browser-core'
import { clocksNow, combine } from '@datadog/browser-core'
import { LifeCycleEventType } from '../lifeCycle'
import type { LifeCycle } from '../lifeCycle'

export interface ResourceOptions {
  /**
   * Resource type
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
   * Response size in bytes
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

export interface CustomResource {
  url: string
  type?: ResourceType
  method?: string
  startClocks: ClocksState
  stopClocks: ClocksState
  statusCode?: number
  size?: number
  context?: Context
}

interface ActiveCustomResource {
  url: string
  type?: ResourceType
  method?: string
  context?: Context
  startClocks: ClocksState
}

export function trackCustomResources(
  lifeCycle: LifeCycle,
  onResourceCompleted: (resource: CustomResource) => void,
  onResourceError: (url: string, errorMessage: string, startClocks: ClocksState) => void
) {
  const active = new Map<string, ActiveCustomResource>()

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => active.clear())

  function getAndRemove(url: string, resourceKey?: string) {
    const key = resourceKey ?? url
    const resource = active.get(key)
    if (resource) active.delete(key)
    return resource
  }

  return {
    startResource(url: string, options: ResourceOptions = {}, startClocks = clocksNow()) {
      const key = options.resourceKey ?? url
      active.delete(key)
      active.set(key, {
        url,
        type: options.type,
        method: options.method,
        context: options.context,
        startClocks,
      })
    },

    stopResource(url: string, options: ResourceStopOptions = {}, stopClocks = clocksNow()) {
      const resource = getAndRemove(url, options.resourceKey)
      if (resource) {
        onResourceCompleted({
          url: resource.url,
          type: resource.type,
          method: resource.method,
          startClocks: resource.startClocks,
          stopClocks,
          statusCode: options.statusCode,
          size: options.size,
          context: combine(resource.context, options.context),
        })
      }
    },

    stopResourceWithError(url: string, errorMessage: string, options: ResourceStopOptions = {}) {
      const resource = getAndRemove(url, options.resourceKey)
      if (resource) onResourceError(url, errorMessage, resource.startClocks)
    },

    stop: () => active.clear(),
  }
}

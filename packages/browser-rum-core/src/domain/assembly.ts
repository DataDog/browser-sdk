import type { RawError, EventRateLimiter } from '@openobserve/browser-core'
import { isEmptyObject, display, createEventRateLimiter, buildTags } from '@openobserve/browser-core'
import { DISCARDED } from '@openobserve/js-core/assembly'
import { combine } from '@openobserve/js-core/util'
import type { RumEventDomainContext } from '../domainContext.types'
import type { AssembledRumEvent } from '../rawRumEvent.types'
import { RumEventType } from '../rawRumEvent.types'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { RumConfiguration } from './configuration'
import type { ModifiableFieldPaths } from './limitModification'
import { limitModification } from './limitModification'
import type { AssembleHook, AssembleHookParams } from './hooks'

const COMMON_MODIFIABLE_FIELD_PATHS: ModifiableFieldPaths = {
  'view.name': 'string',
  'view.url': 'string',
  'view.referrer': 'string',
  context: 'object',
  service: 'string',
  version: 'string',
}

const MODIFIABLE_FIELD_PATHS_BY_EVENT: Record<AssembledRumEvent['type'], ModifiableFieldPaths> = {
  [RumEventType.VIEW]: {
    ...COMMON_MODIFIABLE_FIELD_PATHS,
    'view.performance.lcp.resource_url': 'string',
  },
  [RumEventType.ERROR]: {
    ...COMMON_MODIFIABLE_FIELD_PATHS,
    'error.message': 'string',
    'error.stack': 'string',
    'error.handling_stack': 'string',
    'error.resource.url': 'string',
    'error.fingerprint': 'string',
  },
  [RumEventType.RESOURCE]: {
    ...COMMON_MODIFIABLE_FIELD_PATHS,
    'resource.url': 'string',
    'resource.graphql.variables': 'string',
    'resource.request.headers': 'object',
    'resource.response.headers': 'object',
  },
  [RumEventType.ACTION]: {
    ...COMMON_MODIFIABLE_FIELD_PATHS,
    'action.target.name': 'string',
  },
  [RumEventType.LONG_TASK]: {
    ...COMMON_MODIFIABLE_FIELD_PATHS,
    'long_task.scripts[].source_url': 'string',
    'long_task.scripts[].invoker': 'string',
  },
  [RumEventType.VITAL]: COMMON_MODIFIABLE_FIELD_PATHS,
}

export function startRumAssembly(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  assembleHook: AssembleHook,
  reportError: (error: RawError) => void,
  eventRateLimit?: number
) {
  const eventRateLimiters = {
    [RumEventType.ERROR]: createEventRateLimiter(RumEventType.ERROR, reportError, eventRateLimit),
    [RumEventType.ACTION]: createEventRateLimiter(RumEventType.ACTION, reportError, eventRateLimit),
    [RumEventType.VITAL]: createEventRateLimiter(RumEventType.VITAL, reportError, eventRateLimit),
  }

  lifeCycle.subscribe(
    LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
    ({ startClocks, duration, rawRumEvent, domainContext }) => {
      const defaultRumEventAttributes = assembleHook.trigger({
        eventType: rawRumEvent.type,
        rawRumEvent,
        domainContext,
        startTime: startClocks.relative,
        duration,
      } as AssembleHookParams)!

      if (defaultRumEventAttributes === DISCARDED) {
        return
      }

      const serverRumEvent = combine(defaultRumEventAttributes, rawRumEvent, {
        ddtags: buildTags(configuration).join(','),
      }) as AssembledRumEvent

      if (shouldSend(serverRumEvent, configuration.beforeSend, domainContext, eventRateLimiters)) {
        if (isEmptyObject(serverRumEvent.context!)) {
          delete serverRumEvent.context
        }
        lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, serverRumEvent)
      }
    }
  )
}

function shouldSend(
  event: AssembledRumEvent,
  beforeSend: RumConfiguration['beforeSend'],
  domainContext: RumEventDomainContext,
  eventRateLimiters: { [key in RumEventType]?: EventRateLimiter }
) {
  if (beforeSend) {
    const result = limitModification(event, MODIFIABLE_FIELD_PATHS_BY_EVENT[event.type], (event) =>
      beforeSend(event, domainContext)
    )
    if (result === false && event.type !== RumEventType.VIEW) {
      return false
    }
    if (result === false) {
      display.warn("Can't dismiss view events using beforeSend!")
    }
  }

  const rateLimitReached = eventRateLimiters[event.type]?.isLimitReached()

  return !rateLimitReached
}

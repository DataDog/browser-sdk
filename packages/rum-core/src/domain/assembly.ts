import type { RawError, EventRateLimiter } from '@datadog/browser-core'
import {
  combine,
  isEmptyObject,
  display,
  createEventRateLimiter,
  HookNames,
  DISCARDED,
  buildTags,
  ONE_KIBI_BYTE,
} from '@datadog/browser-core'
import type { RumEventDomainContext } from '../domainContext.types'
import type { AssembledRumEvent } from '../rawRumEvent.types'
import { RumEventType } from '../rawRumEvent.types'
import type { RumResourceEvent } from '../rumEvent.types'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { RumConfiguration } from './configuration'
import type { ModifiableFieldPaths } from './limitModification'
import { limitModification } from './limitModification'
import type { Hooks, AssembleHookParams } from './hooks'

const VIEW_MODIFIABLE_FIELD_PATHS: ModifiableFieldPaths = {
  'view.name': 'string',
  'view.url': 'string',
  'view.referrer': 'string',
}

const USER_CUSTOMIZABLE_FIELD_PATHS: ModifiableFieldPaths = {
  context: 'object',
}

const ROOT_MODIFIABLE_FIELD_PATHS: ModifiableFieldPaths = {
  service: 'string',
  version: 'string',
}

let modifiableFieldPathsByEvent: { [key in RumEventType]: ModifiableFieldPaths }

export function startRumAssembly(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  hooks: Hooks,
  reportError: (error: RawError) => void,
  eventRateLimit?: number
) {
  modifiableFieldPathsByEvent = {
    [RumEventType.VIEW]: {
      'view.performance.lcp.resource_url': 'string',
      ...USER_CUSTOMIZABLE_FIELD_PATHS,
      ...VIEW_MODIFIABLE_FIELD_PATHS,
      ...ROOT_MODIFIABLE_FIELD_PATHS,
    },
    [RumEventType.ERROR]: {
      'error.message': 'string',
      'error.stack': 'string',
      'error.resource.url': 'string',
      'error.fingerprint': 'string',
      ...USER_CUSTOMIZABLE_FIELD_PATHS,
      ...VIEW_MODIFIABLE_FIELD_PATHS,
      ...ROOT_MODIFIABLE_FIELD_PATHS,
    },
    [RumEventType.RESOURCE]: {
      'resource.url': 'string',
      'resource.graphql.variables': 'string',
      ...USER_CUSTOMIZABLE_FIELD_PATHS,
      ...VIEW_MODIFIABLE_FIELD_PATHS,
      ...ROOT_MODIFIABLE_FIELD_PATHS,
    },
    [RumEventType.ACTION]: {
      'action.target.name': 'string',
      ...USER_CUSTOMIZABLE_FIELD_PATHS,
      ...VIEW_MODIFIABLE_FIELD_PATHS,
      ...ROOT_MODIFIABLE_FIELD_PATHS,
    },
    [RumEventType.LONG_TASK]: {
      'long_task.scripts[].source_url': 'string',
      'long_task.scripts[].invoker': 'string',
      ...USER_CUSTOMIZABLE_FIELD_PATHS,
      ...VIEW_MODIFIABLE_FIELD_PATHS,
      ...ROOT_MODIFIABLE_FIELD_PATHS,
    },
    [RumEventType.VITAL]: {
      ...USER_CUSTOMIZABLE_FIELD_PATHS,
      ...VIEW_MODIFIABLE_FIELD_PATHS,
      ...ROOT_MODIFIABLE_FIELD_PATHS,
    },
  }
  const eventRateLimiters = {
    [RumEventType.ERROR]: createEventRateLimiter(RumEventType.ERROR, reportError, eventRateLimit),
    [RumEventType.ACTION]: createEventRateLimiter(RumEventType.ACTION, reportError, eventRateLimit),
    [RumEventType.VITAL]: createEventRateLimiter(RumEventType.VITAL, reportError, eventRateLimit),
  }

  lifeCycle.subscribe(
    LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
    ({ startClocks, duration, rawRumEvent, domainContext }) => {
      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
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

      const savedFields = saveFieldsOfInterest(serverRumEvent)

      if (shouldSend(serverRumEvent, configuration.beforeSend, domainContext, eventRateLimiters)) {
        ensureLegalPayload(serverRumEvent, savedFields)

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
    const result = limitModification(event, modifiableFieldPathsByEvent[event.type], (event) =>
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

const URL_BYTES_LIMIT = 32 * ONE_KIBI_BYTE

interface SavedFields {
  resourceUrl?: string
}

function saveFieldsOfInterest(event: AssembledRumEvent): SavedFields {
  if (event.type === RumEventType.RESOURCE) {
    return { resourceUrl: (event as RumResourceEvent).resource.url }
  }
  return {}
}

function ensureLegalPayload(event: AssembledRumEvent, savedFields: SavedFields) {
  if (event.type === RumEventType.RESOURCE) {
    const resourceEvent = event as RumResourceEvent
    // eslint-disable-next-line eqeqeq
    if (resourceEvent.resource.url == undefined || resourceEvent.resource.url.length > URL_BYTES_LIMIT) {
      resourceEvent.resource.url = savedFields.resourceUrl!.slice(0, URL_BYTES_LIMIT)
      display.warn(`Resource URL is too long, truncated to ${URL_BYTES_LIMIT} characters`)
    }
  }
}

import type { Context, RawError, EventRateLimiter } from '@datadog/browser-core'
import {
  combine,
  isEmptyObject,
  display,
  createEventRateLimiter,
  isExperimentalFeatureEnabled,
  ExperimentalFeature,
} from '@datadog/browser-core'
import type { RumEventDomainContext } from '../domainContext.types'
import { RumEventType } from '../rawRumEvent.types'
import type { RumEvent } from '../rumEvent.types'
import type { Hooks } from '../hooks'
import { DISCARDED, HookNames } from '../hooks'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { RumConfiguration } from './configuration'
import type { ModifiableFieldPaths } from './limitModification'
import { limitModification } from './limitModification'

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
  reportError: (error: RawError) => void
) {
  modifiableFieldPathsByEvent = {
    [RumEventType.VIEW]: {
      'view.performance.lcp.resource_url': 'string',
      ...USER_CUSTOMIZABLE_FIELD_PATHS,
      ...VIEW_MODIFIABLE_FIELD_PATHS,
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
      ...(isExperimentalFeatureEnabled(ExperimentalFeature.WRITABLE_RESOURCE_GRAPHQL)
        ? { 'resource.graphql': 'object' }
        : {}),
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
    },
    [RumEventType.VITAL]: {
      ...USER_CUSTOMIZABLE_FIELD_PATHS,
      ...VIEW_MODIFIABLE_FIELD_PATHS,
    },
  }
  const eventRateLimiters = {
    [RumEventType.ERROR]: createEventRateLimiter(
      RumEventType.ERROR,
      configuration.eventRateLimiterThreshold,
      reportError
    ),
    [RumEventType.ACTION]: createEventRateLimiter(
      RumEventType.ACTION,
      configuration.eventRateLimiterThreshold,
      reportError
    ),
    [RumEventType.VITAL]: createEventRateLimiter(
      RumEventType.VITAL,
      configuration.eventRateLimiterThreshold,
      reportError
    ),
  }

  lifeCycle.subscribe(
    LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
    ({ startTime, duration, rawRumEvent, domainContext, customerContext }) => {
      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: rawRumEvent.type,
        startTime,
        duration,
      })!

      if (defaultRumEventAttributes === DISCARDED) {
        return
      }

      const serverRumEvent = combine(defaultRumEventAttributes, { context: customerContext }, rawRumEvent) as RumEvent &
        Context

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
  event: RumEvent & Context,
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

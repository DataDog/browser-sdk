import {
  combine,
  Context,
  isEmptyObject,
  limitModification,
  timeStampNow,
  currentDrift,
  display,
  BeforeSendCallback,
  RawError,
  createEventRateLimiter,
  EventRateLimiter,
  canUseEventBridge,
} from '@datadog/browser-core'
import { RumEventDomainContext } from '../domainContext.types'
import {
  CommonContext,
  RawRumErrorEvent,
  RawRumEvent,
  RawRumLongTaskEvent,
  RawRumResourceEvent,
  RumContext,
  RumEventType,
  User,
} from '../rawRumEvent.types'
import { RumEvent } from '../rumEvent.types'
import { buildEnv } from '../boot/buildEnv'
import { getSyntheticsContext } from './syntheticsContext'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { ParentContexts } from './parentContexts'
import { RumSessionManager, RumSessionPlan } from './rumSessionManager'
import { UrlContexts } from './urlContexts'
import { RumConfiguration } from './configuration'

enum SessionType {
  SYNTHETICS = 'synthetics',
  USER = 'user',
}

const VIEW_EVENTS_MODIFIABLE_FIELD_PATHS = [
  // Fields with sensitive data
  'view.url',
  'view.referrer',
  'action.target.name',
  'error.message',
  'error.stack',
  'error.resource.url',
  'resource.url',
]

const OTHER_EVENTS_MODIFIABLE_FIELD_PATHS = [
  ...VIEW_EVENTS_MODIFIABLE_FIELD_PATHS,
  // User-customizable field
  'context',
]

type Mutable<T> = { -readonly [P in keyof T]: T[P] }

export function startRumAssembly(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  sessionManager: RumSessionManager,
  parentContexts: ParentContexts,
  urlContexts: UrlContexts,
  getCommonContext: () => CommonContext
) {
  const reportError = (error: RawError) => {
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error })
  }

  const eventRateLimiters = {
    [RumEventType.ERROR]: createEventRateLimiter(RumEventType.ERROR, configuration.maxErrorsPerMinute, reportError),
    [RumEventType.ACTION]: createEventRateLimiter(RumEventType.ACTION, configuration.maxActionsPerMinute, reportError),
  }

  const syntheticsContext = getSyntheticsContext()

  lifeCycle.subscribe(
    LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
    ({ startTime, rawRumEvent, domainContext, savedCommonContext, customerContext }) => {
      const viewContext = parentContexts.findView(startTime)
      const urlContext = urlContexts.findUrl(startTime)
      // allow to send events if the session was tracked when they start
      // except for views which are continuously updated
      // TODO: stop sending view updates when session is expired
      const session = sessionManager.findTrackedSession(rawRumEvent.type !== RumEventType.VIEW ? startTime : undefined)
      if (session && viewContext && urlContext) {
        const actionContext = parentContexts.findAction(startTime)
        const commonContext = savedCommonContext || getCommonContext()
        const rumContext: RumContext = {
          _dd: {
            format_version: 2,
            drift: currentDrift(),
            session: {
              plan: session.hasReplayPlan ? RumSessionPlan.REPLAY : RumSessionPlan.LITE,
            },
            browser_sdk_version: canUseEventBridge() ? buildEnv.sdkVersion : undefined,
          },
          application: {
            id: configuration.applicationId,
          },
          date: timeStampNow(),
          service: configuration.service,
          session: {
            id: session.id,
            type: syntheticsContext ? SessionType.SYNTHETICS : SessionType.USER,
          },
          synthetics: syntheticsContext,
        }
        const serverRumEvent = (needToAssembleWithAction(rawRumEvent)
          ? combine(rumContext, urlContext, viewContext, actionContext, rawRumEvent)
          : combine(rumContext, urlContext, viewContext, rawRumEvent)) as RumEvent & Context

        serverRumEvent.context = combine(commonContext.context, customerContext)

        if (!('has_replay' in serverRumEvent.session)) {
          ;(serverRumEvent.session as Mutable<RumEvent['session']>).has_replay = commonContext.hasReplay
        }

        if (!isEmptyObject(commonContext.user)) {
          ;(serverRumEvent.usr as Mutable<RumEvent['usr']>) = commonContext.user as User & Context
        }

        if (shouldSend(serverRumEvent, configuration.beforeSend, domainContext, eventRateLimiters)) {
          if (isEmptyObject(serverRumEvent.context)) {
            delete serverRumEvent.context
          }
          lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, serverRumEvent)
        }
      }
    }
  )
}

function shouldSend(
  event: RumEvent & Context,
  beforeSend: BeforeSendCallback | undefined,
  domainContext: RumEventDomainContext,
  eventRateLimiters: { [key in RumEventType]?: EventRateLimiter }
) {
  if (beforeSend) {
    const result = limitModification(
      event,
      event.type === RumEventType.VIEW ? VIEW_EVENTS_MODIFIABLE_FIELD_PATHS : OTHER_EVENTS_MODIFIABLE_FIELD_PATHS,
      (event) => beforeSend(event, domainContext)
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

function needToAssembleWithAction(
  event: RawRumEvent
): event is RawRumErrorEvent | RawRumResourceEvent | RawRumLongTaskEvent {
  return [RumEventType.ERROR, RumEventType.RESOURCE, RumEventType.LONG_TASK].indexOf(event.type) !== -1
}

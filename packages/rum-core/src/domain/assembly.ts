import {
  combine,
  Configuration,
  Context,
  isEmptyObject,
  limitModification,
  timeStampNow,
  currentDrift,
  display,
  addMonitoringMessage,
  relativeNow,
  BeforeSendCallback,
  RawError,
  createEventRateLimiter,
  EventRateLimiter,
  getCookie,
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
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { ParentContexts } from './parentContexts'
import { RumSession, RumSessionPlan } from './rumSession'
import { UrlContexts } from './urlContexts'

export interface BrowserWindow extends Window {
  _DATADOG_SYNTHETICS_PUBLIC_ID?: string
  _DATADOG_SYNTHETICS_RESULT_ID?: string
}

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
  applicationId: string,
  configuration: Configuration,
  lifeCycle: LifeCycle,
  session: RumSession,
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

  lifeCycle.subscribe(
    LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
    ({ startTime, rawRumEvent, domainContext, savedCommonContext, customerContext }) => {
      const viewContext = parentContexts.findView(startTime)
      const urlContext = urlContexts.findUrl(startTime)
      if (session.isTracked() && viewContext && urlContext && viewContext.session.id === session.getId()) {
        const actionContext = parentContexts.findAction(startTime)
        const commonContext = savedCommonContext || getCommonContext()
        const rumContext: RumContext = {
          _dd: {
            format_version: 2,
            drift: currentDrift(),
            session: {
              plan: session.hasReplayPlan() ? RumSessionPlan.REPLAY : RumSessionPlan.LITE,
            },
          },
          application: {
            id: applicationId,
          },
          date: timeStampNow(),
          service: configuration.service,
          session: {
            // must be computed on each event because synthetics instrumentation can be done after sdk execution
            type: getSessionType(),
          },
          synthetics: getSyntheticsContext(),
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
          if (typeof serverRumEvent.date !== 'number') {
            addMonitoringMessage('invalid date', {
              debug: {
                eventType: serverRumEvent.type,
                eventTimeStamp: serverRumEvent.date,
                eventRelativeTime: Math.round(startTime),
                timeStampNow: timeStampNow(),
                relativeNow: Math.round(relativeNow()),
                drift: currentDrift(),
              },
            })
          }
          if (serverRumEvent.session.has_replay && serverRumEvent._dd.session?.plan === RumSessionPlan.LITE) {
            addMonitoringMessage('lite session with replay', {
              debug: {
                eventType: serverRumEvent.type,
                viewId: serverRumEvent.view.id,
                sessionId: serverRumEvent.session.id,
                event: serverRumEvent,
                _dd_s: getCookie('_dd_s'),
              },
            })
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

function getSessionType() {
  return navigator.userAgent.indexOf('DatadogSynthetics') === -1 && !getSyntheticsContext()
    ? SessionType.USER
    : SessionType.SYNTHETICS
}

function getSyntheticsContext() {
  const testId = (window as BrowserWindow)._DATADOG_SYNTHETICS_PUBLIC_ID
  const resultId = (window as BrowserWindow)._DATADOG_SYNTHETICS_RESULT_ID

  if (typeof testId === 'string' && typeof resultId === 'string') {
    return {
      test_id: testId,
      result_id: resultId,
    }
  }
}

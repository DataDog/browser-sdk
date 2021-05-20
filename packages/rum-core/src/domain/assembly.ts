import {
  combine,
  Configuration,
  Context,
  createErrorFilter,
  ErrorFilter,
  isEmptyObject,
  limitModification,
  timeStampNow,
  currentDrift,
  display,
} from '@datadog/browser-core'
import {
  CommonContext,
  RawRumErrorEvent,
  RawRumEvent,
  RawRumLongTaskEvent,
  RawRumResourceEvent,
  RumContext,
  RawRumViewEvent,
  RawRumActionEvent,
  RumEventType,
  User,
} from '../rawRumEvent.types'
import { RumEvent } from '../rumEvent.types'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { ParentContexts } from './parentContexts'
import { ForegroundContexts } from './foregroundContexts'
import { RumSession } from './rumSession'

interface BrowserWindow extends Window {
  _DATADOG_SYNTHETICS_BROWSER?: unknown
}

enum SessionType {
  SYNTHETICS = 'synthetics',
  USER = 'user',
}

const FIELDS_WITH_SENSITIVE_DATA = [
  'view.url',
  'view.referrer',
  'action.target.name',
  'error.message',
  'error.stack',
  'error.resource.url',
  'resource.url',
]

export function startRumAssembly(
  applicationId: string,
  configuration: Configuration,
  lifeCycle: LifeCycle,
  session: RumSession,
  parentContexts: ParentContexts,
  foregroundContexts: ForegroundContexts,
  getCommonContext: () => CommonContext
) {
  const errorFilter = createErrorFilter(configuration, (error) => {
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error })
  })

  lifeCycle.subscribe(
    LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
    ({ startTime, rawRumEvent, savedCommonContext, customerContext }) => {
      const viewContext = parentContexts.findView(startTime)
      if (session.isTracked() && viewContext && viewContext.session.id === session.getId()) {
        const actionContext = parentContexts.findAction(startTime)
        const in_foreground = foregroundContexts.getInForeground(startTime)
        const commonContext = savedCommonContext || getCommonContext()
        const rumContext: RumContext = {
          _dd: {
            format_version: 2,
            drift: currentDrift(),
          },
          application: {
            id: applicationId,
          },
          date: timeStampNow(),
          service: configuration.service,
          session: {
            // must be computed on each event because synthetics instrumentation can be done after sdk execution
            // cf https://github.com/puppeteer/puppeteer/issues/3667
            type: getSessionType(),
          },
        }
        let serverRumEvent = (needToAssembleWithAction(rawRumEvent)
          ? combine(rumContext, viewContext, actionContext, rawRumEvent)
          : combine(rumContext, viewContext, rawRumEvent)) as RumEvent & Context

        if (needToAssembleWithInForeground(rawRumEvent)) {
          serverRumEvent = combine(serverRumEvent, { view: { in_foreground } })
        }

        if (isView(rawRumEvent)) {
          const in_foreground_periods = foregroundContexts.getInForegroundPeriods(
            startTime,
            rawRumEvent.view.time_spent
          )
          serverRumEvent = combine(serverRumEvent, { view: { in_foreground_periods } })
        }

        const context = combine(commonContext.context, customerContext)
        if (!isEmptyObject(context)) {
          serverRumEvent.context = context
        }

        if (!('has_replay' in serverRumEvent.session)) {
          ;(serverRumEvent.session as { has_replay?: boolean }).has_replay = commonContext.hasReplay
        }

        if (!isEmptyObject(commonContext.user)) {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          ;(serverRumEvent.usr as RumEvent['usr']) = commonContext.user as User & Context
        }
        if (shouldSend(serverRumEvent, configuration.beforeSend, errorFilter)) {
          lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, serverRumEvent)
        }
      }
    }
  )
}

function shouldSend(
  event: RumEvent & Context,
  beforeSend: ((event: any) => unknown) | undefined,
  errorFilter: ErrorFilter
) {
  if (beforeSend) {
    const result = limitModification(event, FIELDS_WITH_SENSITIVE_DATA, beforeSend)
    if (result === false && event.type !== RumEventType.VIEW) {
      return false
    }
    if (result === false) {
      display.warn("Can't dismiss view events using beforeSend!")
    }
  }
  if (event.type === RumEventType.ERROR) {
    return !errorFilter.isLimitReached()
  }
  return true
}

function needToAssembleWithAction(
  event: RawRumEvent
): event is RawRumErrorEvent | RawRumResourceEvent | RawRumLongTaskEvent {
  return [RumEventType.ERROR, RumEventType.RESOURCE, RumEventType.LONG_TASK].indexOf(event.type) !== -1
}

function needToAssembleWithInForeground(event: RawRumEvent): event is RawRumErrorEvent | RawRumActionEvent {
  return [RumEventType.ERROR, RumEventType.ACTION].indexOf(event.type) !== -1
}

function isView(event: RawRumEvent): event is RawRumViewEvent {
  return RumEventType.VIEW === event.type
}

function getSessionType() {
  return (window as BrowserWindow)._DATADOG_SYNTHETICS_BROWSER === undefined ? SessionType.USER : SessionType.SYNTHETICS
}

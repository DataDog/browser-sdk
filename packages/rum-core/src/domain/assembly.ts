import { combine, Configuration, Context, isEmptyObject, limitModification } from '@datadog/browser-core'
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
  getCommonContext: () => CommonContext
) {
  lifeCycle.subscribe(
    LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
    ({ startTime, rawRumEvent, savedCommonContext, customerContext }) => {
      const viewContext = parentContexts.findView(startTime)
      if (session.isTracked() && viewContext && viewContext.session.id) {
        const actionContext = parentContexts.findAction(startTime)
        const commonContext = savedCommonContext || getCommonContext()
        const rumContext: RumContext = {
          _dd: {
            format_version: 2,
          },
          application: {
            id: applicationId,
          },
          date: new Date().getTime(),
          service: configuration.service,
          session: {
            has_replay: commonContext.hasReplay,
            // must be computed on each event because synthetics instrumentation can be done after sdk execution
            // cf https://github.com/puppeteer/puppeteer/issues/3667
            type: getSessionType(),
          },
        }
        const serverRumEvent = (needToAssembleWithAction(rawRumEvent)
          ? combine(rumContext, viewContext, actionContext, rawRumEvent)
          : combine(rumContext, viewContext, rawRumEvent)) as RumEvent & Context

        const context = combine(commonContext.context, customerContext)
        if (!isEmptyObject(context)) {
          serverRumEvent.context = context
        }

        if (!isEmptyObject(commonContext.user)) {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          ;(serverRumEvent.usr as RumEvent['usr']) = commonContext.user as User & Context
        }
        if (shouldSend(serverRumEvent, configuration.beforeSend)) {
          lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, serverRumEvent)
        }
      }
    }
  )
}

function shouldSend(event: RumEvent & Context, beforeSend?: (event: any) => any) {
  if (beforeSend) {
    const result = limitModification(event, FIELDS_WITH_SENSITIVE_DATA, beforeSend)
    if (result === false && event.type !== RumEventType.VIEW) {
      return false
    }
    if (result === false) {
      console.warn(`Can't dismiss view events using beforeSend, use onNewLocation instead!`)
    }
  }
  return true
}

function needToAssembleWithAction(
  event: RawRumEvent
): event is RawRumErrorEvent | RawRumResourceEvent | RawRumLongTaskEvent {
  return [RumEventType.ERROR, RumEventType.RESOURCE, RumEventType.LONG_TASK].indexOf(event.type) !== -1
}

function getSessionType() {
  // eslint-disable-next-line no-underscore-dangle
  return (window as BrowserWindow)._DATADOG_SYNTHETICS_BROWSER === undefined ? SessionType.USER : SessionType.SYNTHETICS
}

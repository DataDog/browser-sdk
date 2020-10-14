import { combine, Configuration, Context, withSnakeCaseKeys } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { ActionContext, ParentContexts, ViewContext } from './parentContexts'
import {
  RawRumEvent,
  RumErrorEvent,
  RumEventCategory,
  RumLongTaskEvent,
  RumResourceEvent,
  RumUserActionEvent,
  RumViewEvent,
} from './rum'
import { RumSession } from './rumSession'

interface BrowserWindow extends Window {
  _DATADOG_SYNTHETICS_BROWSER?: unknown
}

interface RumContext {
  applicationId: string
  date: number
  service?: string
  session: {
    type: string
  }
}

export type RumEvent =
  | RumErrorEvent & ActionContext & ViewContext & RumContext
  | RumResourceEvent & ActionContext & ViewContext & RumContext
  | RumViewEvent & ViewContext & RumContext
  | RumLongTaskEvent & ActionContext & ViewContext & RumContext
  | RumUserActionEvent & ViewContext & RumContext

enum SessionType {
  SYNTHETICS = 'synthetics',
  USER = 'user',
}

export function startRumAssembly(
  applicationId: string,
  configuration: Configuration,
  lifeCycle: LifeCycle,
  session: RumSession,
  parentContexts: ParentContexts,
  getGlobalContext: () => Context
) {
  lifeCycle.subscribe(
    LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
    ({
      startTime,
      rawRumEvent,
      savedGlobalContext,
      customerContext,
    }: {
      startTime: number
      rawRumEvent: RawRumEvent
      savedGlobalContext?: Context
      customerContext?: Context
    }) => {
      const viewContext = parentContexts.findView(startTime)
      if (session.isTracked() && viewContext && viewContext.sessionId) {
        const actionContext = parentContexts.findAction(startTime)
        const rumContext: RumContext = {
          applicationId,
          date: new Date().getTime(),
          service: configuration.service,
          session: {
            // must be computed on each event because synthetics instrumentation can be done after sdk execution
            // cf https://github.com/puppeteer/puppeteer/issues/3667
            type: getSessionType(),
          },
        }
        const rumEvent = needToAssembleWithAction(rawRumEvent)
          ? combine(rumContext, viewContext, actionContext, rawRumEvent)
          : combine(rumContext, viewContext, rawRumEvent)
        const serverRumEvent = combine(
          savedGlobalContext || getGlobalContext(),
          customerContext,
          withSnakeCaseKeys(rumEvent)
        )
        lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { rumEvent, serverRumEvent })
      }
    }
  )
}

function needToAssembleWithAction(event: RawRumEvent): event is RumErrorEvent | RumResourceEvent | RumLongTaskEvent {
  return (
    [RumEventCategory.ERROR, RumEventCategory.RESOURCE, RumEventCategory.LONG_TASK].indexOf(event.evt.category) !== -1
  )
}

function getSessionType() {
  return (window as BrowserWindow)._DATADOG_SYNTHETICS_BROWSER === undefined ? SessionType.USER : SessionType.SYNTHETICS
}

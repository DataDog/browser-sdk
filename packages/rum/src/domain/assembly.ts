import { combine, Configuration, Context, withSnakeCaseKeys } from '@datadog/browser-core'
import { RawRumEvent, RumContext, RumErrorEvent, RumEventType, RumLongTaskEvent, RumResourceEvent } from '../types'
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
      if (session.isTracked() && viewContext && viewContext.session.id) {
        const actionContext = parentContexts.findAction(startTime)
        const rumContext: RumContext = {
          _dd: {
            formatVersion: 2,
          },
          application: {
            id: applicationId,
          },
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
        const serverRumEvent = withSnakeCaseKeys(rumEvent)
        serverRumEvent.context = combine(savedGlobalContext || getGlobalContext(), customerContext)
        lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { rumEvent, serverRumEvent })
      }
    }
  )
}

function needToAssembleWithAction(event: RawRumEvent): event is RumErrorEvent | RumResourceEvent | RumLongTaskEvent {
  return [RumEventType.ERROR, RumEventType.RESOURCE, RumEventType.LONG_TASK].indexOf(event.type) !== -1
}

function getSessionType() {
  return (window as BrowserWindow)._DATADOG_SYNTHETICS_BROWSER === undefined ? SessionType.USER : SessionType.SYNTHETICS
}

import { combine, Configuration, Context, withSnakeCaseKeys } from '@datadog/browser-core'
import {
  RawRumEventV2,
  RumContextV2,
  RumErrorEventV2,
  RumEventType,
  RumLongTaskEventV2,
  RumResourceEventV2,
} from '../typesV2'
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

export function startRumAssemblyV2(
  applicationId: string,
  configuration: Configuration,
  lifeCycle: LifeCycle,
  session: RumSession,
  parentContexts: ParentContexts,
  getGlobalContext: () => Context
) {
  lifeCycle.subscribe(
    LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED,
    ({
      startTime,
      rawRumEvent,
      savedGlobalContext,
      customerContext,
    }: {
      startTime: number
      rawRumEvent: RawRumEventV2
      savedGlobalContext?: Context
      customerContext?: Context
    }) => {
      const viewContext = parentContexts.findViewV2(startTime)
      if (session.isTracked() && viewContext && viewContext.session.id) {
        const actionContext = parentContexts.findActionV2(startTime)
        const rumContext: RumContextV2 = {
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
        lifeCycle.notify(LifeCycleEventType.RUM_EVENT_V2_COLLECTED, { rumEvent, serverRumEvent })
      }
    }
  )
}

function needToAssembleWithAction(
  event: RawRumEventV2
): event is RumErrorEventV2 | RumResourceEventV2 | RumLongTaskEventV2 {
  return [RumEventType.ERROR, RumEventType.RESOURCE, RumEventType.LONG_TASK].indexOf(event.type) !== -1
}

function getSessionType() {
  return (window as BrowserWindow)._DATADOG_SYNTHETICS_BROWSER === undefined ? SessionType.USER : SessionType.SYNTHETICS
}

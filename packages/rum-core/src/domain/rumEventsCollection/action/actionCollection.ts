import { combine, Configuration, getTimestamp, msToNs } from '@datadog/browser-core'
import { CommonContext, RawRumActionEvent, RumEventType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { ActionType, AutoAction, CustomAction, trackActions } from './trackActions'

export function startActionCollection(lifeCycle: LifeCycle, configuration: Configuration) {
  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, (action) =>
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action))
  )

  if (configuration.trackInteractions) {
    trackActions(lifeCycle)
  }

  return {
    addAction(action: CustomAction, savedCommonContext?: CommonContext) {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        savedCommonContext,
        ...processAction(action),
      })
    },
  }
}

function processAction(action: AutoAction | CustomAction) {
  const autoActionProperties = isAutoAction(action)
    ? // tslint:disable-next-line: no-object-literal-type-assertion
      ({
        action: {
          error: {
            count: action.counts.errorCount,
          },
          id: action.id,
          loading_time: msToNs(action.duration),
          long_task: {
            count: action.counts.longTaskCount,
          },
          resource: {
            count: action.counts.resourceCount,
          },
        },
      } as Partial<RawRumActionEvent>)
    : undefined
  const customerContext = !isAutoAction(action) ? action.context : undefined
  const actionEvent: RawRumActionEvent = combine(
    {
      action: {
        target: {
          name: action.name,
        },
        type: action.type,
      },
      date: getTimestamp(action.startTime),
      type: RumEventType.ACTION as const,
    },
    autoActionProperties
  )
  return {
    customerContext,
    rawRumEvent: actionEvent,
    startTime: action.startTime,
  }
}

function isAutoAction(action: AutoAction | CustomAction): action is AutoAction {
  return action.type !== ActionType.CUSTOM
}

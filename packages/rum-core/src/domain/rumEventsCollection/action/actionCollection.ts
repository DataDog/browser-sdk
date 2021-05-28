import { combine, Configuration, toServerDuration, generateUUID } from '@datadog/browser-core'
import { ActionType, CommonContext, RumEventType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { AutoAction, CustomAction, trackActions } from './trackActions'

export function startActionCollection(lifeCycle: LifeCycle, configuration: Configuration) {
  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, (action) =>
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action))
  )

  if (configuration.trackInteractions) {
    trackActions(lifeCycle)
  }

  return {
    addAction: (action: CustomAction, savedCommonContext?: CommonContext) => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        savedCommonContext,
        ...processAction(action),
      })
    },
  }
}

function processAction(action: AutoAction | CustomAction) {
  const commonActionProperties = {
    action: {
      target: {
        name: action.name,
      },
      type: action.type,
    },
    date: action.startClocks.timeStamp,
    type: RumEventType.ACTION as const,
  }
  const actionEvent = isAutoAction(action)
    ? combine(commonActionProperties, {
        action: {
          error: {
            count: action.counts.errorCount,
          },
          id: action.id,
          loading_time: toServerDuration(action.duration),
          long_task: {
            count: action.counts.longTaskCount,
          },
          resource: {
            count: action.counts.resourceCount,
          },
        },
      })
    : combine(commonActionProperties, {
        action: {
          id: generateUUID(),
        },
      })
  const customerContext = !isAutoAction(action) ? action.context : undefined
  return {
    customerContext,
    rawRumEvent: actionEvent,
    startTime: action.startClocks.relative,
  }
}

function isAutoAction(action: AutoAction | CustomAction): action is AutoAction {
  return action.type !== ActionType.CUSTOM
}

import { combine, Configuration, Context, getTimestamp, msToNs } from '@datadog/browser-core'
import { RumEventCategory, RumUserActionEvent } from '../../../types'
import { RumActionEventV2, RumEventType } from '../../../typesV2'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { ActionType, AutoAction, CustomAction, trackActions } from './trackActions'

export function startActionCollection(lifeCycle: LifeCycle, configuration: Configuration) {
  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, (action) => {
    configuration.isEnabled('v2_format')
      ? lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, processActionV2(action))
      : lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action))
  })

  if (configuration.trackInteractions) {
    trackActions(lifeCycle)
  }

  return {
    addAction(action: CustomAction, savedGlobalContext?: Context) {
      configuration.isEnabled('v2_format')
        ? lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
            savedGlobalContext,
            ...processActionV2(action),
          })
        : lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
            savedGlobalContext,
            ...processAction(action),
          })
    },
  }
}

function processAction(action: AutoAction | CustomAction) {
  const autoActionProperties = isAutoAction(action)
    ? {
        duration: msToNs(action.duration),
        userAction: {
          id: action.id,
          measures: action.counts,
        },
      }
    : undefined
  const customerContext = !isAutoAction(action) ? action.context : undefined
  const actionEvent: RumUserActionEvent = combine(
    {
      date: getTimestamp(action.startTime),
      evt: {
        category: RumEventCategory.USER_ACTION as const,
        name: action.name,
      },
      userAction: {
        type: action.type,
      },
    },
    autoActionProperties
  )
  return {
    customerContext,
    rawRumEvent: actionEvent,
    startTime: action.startTime,
  }
}

function processActionV2(action: AutoAction | CustomAction) {
  const autoActionProperties = isAutoAction(action)
    ? {
        action: {
          error: {
            count: action.counts.errorCount,
          },
          id: action.id,
          loadingTime: msToNs(action.duration),
          longTask: {
            count: action.counts.longTaskCount,
          },
          resource: {
            count: action.counts.resourceCount,
          },
        },
      }
    : undefined
  const customerContext = !isAutoAction(action) ? action.context : undefined
  const actionEvent: RumActionEventV2 = combine(
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

import { combine, Configuration, toServerDuration } from '@datadog/browser-core'
import { ActionType, CommonContext, RumEventType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { DOMMutationObservable } from '../../../browser/domMutationObservable'
import { AutoAction, CustomAction, trackActions } from './trackActions'

export function startActionCollection(
  lifeCycle: LifeCycle,
  domMutationObservable: DOMMutationObservable,
  configuration: Configuration
) {
  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, (action) =>
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action))
  )

  if (configuration.trackInteractions) {
    trackActions(lifeCycle, domMutationObservable)
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
  const autoActionProperties = isAutoAction(action)
    ? {
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
      }
    : undefined
  const customerContext = !isAutoAction(action) ? action.context : undefined
  const actionEvent = combine(
    {
      action: {
        target: {
          name: action.name,
        },
        type: action.type,
      },
      date: action.startClocks.timeStamp,
      type: RumEventType.ACTION as const,
    },
    autoActionProperties
  )
  return {
    customerContext,
    rawRumEvent: actionEvent,
    startTime: action.startClocks.relative,
  }
}

function isAutoAction(action: AutoAction | CustomAction): action is AutoAction {
  return action.type !== ActionType.CUSTOM
}

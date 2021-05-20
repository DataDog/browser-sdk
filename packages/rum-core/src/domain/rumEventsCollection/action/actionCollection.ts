import { combine, Configuration, toServerDuration } from '@datadog/browser-core'
import { ActionType, CommonContext, RumEventType, RawRumActionEvent } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { ForegroundContexts } from '../../foregroundContexts'
import { AutoAction, CustomAction, trackActions } from './trackActions'

export function startActionCollection(
  lifeCycle: LifeCycle,
  configuration: Configuration,
  foregroundContexts: ForegroundContexts
) {
  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, (action) =>
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action, foregroundContexts))
  )

  if (configuration.trackInteractions) {
    trackActions(lifeCycle)
  }

  return {
    addAction: (action: CustomAction, savedCommonContext?: CommonContext) => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        savedCommonContext,
        ...processAction(action, foregroundContexts),
      })
    },
  }
}

function processAction(action: AutoAction | CustomAction, foregroundContexts: ForegroundContexts) {
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
  const actionEvent: RawRumActionEvent = combine(
    {
      action: {
        target: {
          name: action.name,
        },
        type: action.type,
      },
      date: action.startClocks.timeStamp,
      type: RumEventType.ACTION as const,
      view: {},
    },
    autoActionProperties
  )
  const inForeground = foregroundContexts.getInForeground(action.startClocks.relative)
  if (inForeground !== undefined) {
    actionEvent.view.in_foreground = inForeground
  }
  return {
    customerContext,
    rawRumEvent: actionEvent,
    startTime: action.startClocks.relative,
  }
}

function isAutoAction(action: AutoAction | CustomAction): action is AutoAction {
  return action.type !== ActionType.CUSTOM
}

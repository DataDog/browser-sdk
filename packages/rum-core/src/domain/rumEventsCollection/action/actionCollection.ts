import { combine, Configuration, toServerDuration, generateUUID } from '@datadog/browser-core'
import { ActionType, CommonContext, RumEventType, RawRumActionEvent } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType, RawRumEventCollectedData } from '../../lifeCycle'
import { DOMMutationObservable } from '../../../browser/domMutationObservable'
import { ForegroundContexts } from '../../foregroundContexts'
import { AutoAction, CustomAction, trackActions } from './trackActions'

export function startActionCollection(
  lifeCycle: LifeCycle,
  domMutationObservable: DOMMutationObservable,
  configuration: Configuration,
  foregroundContexts: ForegroundContexts
) {
  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, (action) =>
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action, foregroundContexts))
  )

  if (configuration.trackInteractions) {
    trackActions(lifeCycle, domMutationObservable, configuration)
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

function processAction(
  action: AutoAction | CustomAction,
  foregroundContexts: ForegroundContexts
): RawRumEventCollectedData<RawRumActionEvent> {
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
        id: generateUUID(),
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
  const inForeground = foregroundContexts.getInForeground(action.startClocks.relative)
  if (inForeground !== undefined) {
    actionEvent.view = { in_foreground: inForeground }
  }
  return {
    customerContext,
    rawRumEvent: actionEvent,
    startTime: action.startClocks.relative,
    domainContext: isAutoAction(action) ? { event: action.event } : {},
  }
}

function isAutoAction(action: AutoAction | CustomAction): action is AutoAction {
  return action.type !== ActionType.CUSTOM
}

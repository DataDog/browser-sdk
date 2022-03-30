import type { Observable } from '@datadog/browser-core'
import { noop, assign, combine, toServerDuration, generateUUID } from '@datadog/browser-core'

import type { CommonContext, RawRumActionEvent } from '../../../rawRumEvent.types'
import { ActionType, RumEventType } from '../../../rawRumEvent.types'
import type { LifeCycle, RawRumEventCollectedData } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import type { ForegroundContexts } from '../../foregroundContexts'
import type { RumConfiguration } from '../../configuration'
import type { ActionContexts, AutoAction, CustomAction } from './trackActions'
import { trackActions } from './trackActions'

export type { ActionContexts }

export function startActionCollection(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  configuration: RumConfiguration,
  foregroundContexts: ForegroundContexts
) {
  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, (action) =>
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action, foregroundContexts))
  )

  let actionContexts: ActionContexts = { findActionId: noop as () => undefined }
  if (configuration.trackInteractions) {
    actionContexts = trackActions(lifeCycle, domMutationObservable, configuration).actionContexts
  }

  return {
    addAction: (action: CustomAction, savedCommonContext?: CommonContext) => {
      lifeCycle.notify(
        LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
        assign(
          {
            savedCommonContext,
          },
          processAction(action, foregroundContexts)
        )
      )
    },
    actionContexts,
  }
}

function processAction(
  action: AutoAction | CustomAction,
  foregroundContexts: ForegroundContexts
): RawRumEventCollectedData<RawRumActionEvent> {
  const autoActionProperties = isAutoAction(action)
    ? {
        action: {
          id: action.id,
          loading_time: toServerDuration(action.duration),
          frustration_type: action.frustrationTypes,
          error: {
            count: action.counts.errorCount,
          },
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
  const inForeground = foregroundContexts.isInForegroundAt(action.startClocks.relative)
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

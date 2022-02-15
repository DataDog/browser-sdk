import type { Observable } from '@datadog/browser-core'
import { isExperimentalFeatureEnabled, combine, toServerDuration, generateUUID } from '@datadog/browser-core'

import type { CommonContext, RawRumActionEvent } from '../../../rawRumEvent.types'
import { ActionType, RumEventType } from '../../../rawRumEvent.types'
import type { LifeCycle, RawRumEventCollectedData } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import type { ForegroundContexts } from '../../foregroundContexts'
import type { RumConfiguration } from '../../configuration'
import type { AutoAction, CustomAction } from './trackActions'
import { trackActions } from './trackActions'
import { trackFrustrationSignals } from './trackFrustrationSignals'

export function startActionCollection(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  configuration: RumConfiguration,
  foregroundContexts: ForegroundContexts
) {
  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, (action) =>
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action, foregroundContexts))
  )

  if (configuration.trackInteractions) {
    trackActions(lifeCycle, domMutationObservable, configuration)

    if (isExperimentalFeatureEnabled('frustration-signals')) {
      trackFrustrationSignals(lifeCycle, domMutationObservable, configuration).subscribe((signal) => {
        const rawRumEvent: RawRumActionEvent = {
          date: signal.startClocks.timeStamp,
          type: RumEventType.ACTION,
          action: {
            id: generateUUID(),
            target: { name: signal.name },
            type: signal.type as ActionType,
            loading_time: toServerDuration(signal.duration),
          },
        }
        lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
          rawRumEvent,
          startTime: signal.startClocks.relative,
          domainContext: { event: signal.event },
          customerContext: signal.context,
        })
      })
    }
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

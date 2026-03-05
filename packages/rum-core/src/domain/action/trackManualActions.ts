import type { ClocksState, Context, Duration } from '@datadog/browser-core'
import { clocksNow, generateUUID } from '@datadog/browser-core'
import type { ActionType, FrustrationType } from '../../rawRumEvent.types'
import { ActionType as ActionTypeEnum, FrustrationType as FrustrationTypeEnum } from '../../rawRumEvent.types'
import type { EventCounts } from '../trackEventCounts'
import { startEventTracker } from '../eventTracker'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { isActionChildEvent } from './isActionChildEvent'

export type ActionCounts = EventCounts

export interface ActionOptions {
  /**
   * Action Type
   *
   * @default 'custom'
   */
  type?: ActionType

  /**
   * Action context
   */
  context?: any

  /**
   * Action key
   */
  actionKey?: string
}

export interface ManualAction {
  id: string
  type: ActionType
  name: string
  startClocks: ClocksState
  duration?: Duration
  context?: Context
  handlingStack?: string
  counts?: ActionCounts
  frustrationTypes: FrustrationType[]
}

export interface ActionEventData {
  name: string
  type?: ActionType
  context?: Context
}

export function trackManualActions(lifeCycle: LifeCycle, onManualActionCompleted: (action: ManualAction) => void) {
  const actionTracker = startEventTracker<ActionEventData>(lifeCycle)
  function startManualAction(name: string, options: ActionOptions = {}, startClocks = clocksNow()) {
    const lookupKey = options.actionKey ?? name

    const startedManualAction = actionTracker.start(
      lookupKey,
      startClocks,
      {
        name,
        ...options,
      },
      { isChildEvent: isActionChildEvent }
    )

    lifeCycle.notify(LifeCycleEventType.ACTION_STARTED, startedManualAction)
  }

  function stopManualAction(name: string, options: ActionOptions = {}, stopClocks = clocksNow()) {
    const lookupKey = options.actionKey ?? name

    const stopped = actionTracker.stop(lookupKey, stopClocks, options)

    if (!stopped) {
      return
    }

    const frustrationTypes: FrustrationType[] = []
    if (stopped.counts && stopped.counts.errorCount > 0) {
      frustrationTypes.push(FrustrationTypeEnum.ERROR_CLICK)
    }

    const manualAction: ManualAction = {
      ...stopped,
      type: stopped.type || ActionTypeEnum.CUSTOM,
      frustrationTypes,
    }

    onManualActionCompleted(manualAction)
  }

  function addInstantAction(action: Omit<ManualAction, 'id' | 'duration' | 'counts' | 'frustrationTypes'>) {
    onManualActionCompleted({ id: generateUUID(), frustrationTypes: [], ...action })
  }

  return {
    addAction: addInstantAction,
    startAction: startManualAction,
    stopAction: stopManualAction,
    findActionId: actionTracker.findId,
    stop: actionTracker.stopAll,
  }
}

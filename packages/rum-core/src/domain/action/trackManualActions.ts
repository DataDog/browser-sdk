import type { ClocksState, Context, Duration } from '@datadog/browser-core'
import { clocksNow, generateUUID } from '@datadog/browser-core'
import type { ActionType, FrustrationType } from '../../rawRumEvent.types'
import { ActionType as ActionTypeEnum, FrustrationType as FrustrationTypeEnum } from '../../rawRumEvent.types'
import type { EventTracker } from '../eventTracker'
import type { EventCounts } from '../trackEventCounts'

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
  name?: string
  type?: ActionType
  context?: Context
}

export function trackManualActions(
  actionTracker: EventTracker<ActionEventData>,
  onManualActionCompleted: (action: ManualAction) => void
) {
  function startManualAction(name: string, options: ActionOptions = {}, startClocks = clocksNow()) {
    const lookupKey = options.actionKey ?? name

    actionTracker.start(
      lookupKey,
      startClocks,
      {
        name,
        type: options.type,
        context: options.context,
      },
      {
        trackCounts: true,
      }
    )
  }

  function stopManualAction(name: string, options: ActionOptions = {}, stopClocks = clocksNow()) {
    const lookupKey = options.actionKey ?? name

    const stopped = actionTracker.stop(lookupKey, stopClocks, {
      type: options.type,
      context: options.context,
    })

    if (!stopped) {
      return
    }

    const { data } = stopped

    const frustrationTypes: FrustrationType[] = []
    if (stopped.counts && stopped.counts.errorCount > 0) {
      frustrationTypes.push(FrustrationTypeEnum.ERROR_CLICK)
    }

    const manualAction: ManualAction = {
      id: stopped.id,
      name: data.name!,
      type: data.type || ActionTypeEnum.CUSTOM,
      startClocks: stopped.startClocks,
      duration: stopped.duration,
      context: data.context,
      counts: stopped.counts,
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
  }
}

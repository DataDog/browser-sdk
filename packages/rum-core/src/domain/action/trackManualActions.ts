import type { ClocksState, Context, Duration } from '@datadog/browser-core'
import { clocksNow, generateUUID } from '@datadog/browser-core'
import type { ActionType, FrustrationType } from '../../rawRumEvent.types'
import { ActionType as ActionTypeEnum, FrustrationType as FrustrationTypeEnum } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { createManualEventLifecycle } from '../manualEventRegistry'
import type { ActionCounts, ActionTracker, TrackedAction } from './trackAction'

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

interface ManualActionStart {
  name: string
  type?: ActionType
  context?: Context
  trackedAction: TrackedAction
}

export function trackManualActions(
  lifeCycle: LifeCycle,
  actionTracker: ActionTracker,
  onManualActionCompleted: (action: ManualAction) => void
) {
  const lifecycle = createManualEventLifecycle<ManualActionStart>(lifeCycle, (data) => data.trackedAction.discard())

  function startManualAction(name: string, options: ActionOptions = {}, startClocks = clocksNow()) {
    const lookupKey = options.actionKey ?? name
    const trackedAction = actionTracker.createTrackedAction(startClocks)

    lifecycle.add(lookupKey, startClocks, {
      name,
      type: options.type,
      context: options.context,
      trackedAction,
    })
  }

  function stopManualAction(name: string, options: ActionOptions = {}, stopClocks = clocksNow()) {
    const lookupKey = options.actionKey ?? name
    const stopData: Partial<ManualActionStart> = {}
    if (options.type !== undefined) {
      stopData.type = options.type
    }
    if (options.context !== undefined) {
      stopData.context = options.context
    }

    const activeAction = lifecycle.remove(lookupKey, stopClocks, stopData)

    if (!activeAction) {
      return
    }

    activeAction.trackedAction.stop(stopClocks.relative)

    const frustrationTypes: FrustrationType[] = []
    if (activeAction.trackedAction.counts.errorCount > 0) {
      frustrationTypes.push(FrustrationTypeEnum.ERROR_CLICK)
    }

    const manualAction: ManualAction = {
      id: activeAction.trackedAction.id,
      name: activeAction.name,
      type: activeAction.type || ActionTypeEnum.CUSTOM,
      startClocks: activeAction.startClocks,
      duration: activeAction.duration,
      context: activeAction.context,
      counts: activeAction.trackedAction.counts,
      frustrationTypes,
    }

    onManualActionCompleted(manualAction)
  }

  function addInstantAction(action: Omit<ManualAction, 'id' | 'duration' | 'counts' | 'frustrationTypes'>) {
    onManualActionCompleted({ id: generateUUID(), frustrationTypes: [], ...action })
  }

  function stop() {
    lifecycle.stopAll()
  }

  return {
    addAction: addInstantAction,
    startAction: startManualAction,
    stopAction: stopManualAction,
    stop,
  }
}

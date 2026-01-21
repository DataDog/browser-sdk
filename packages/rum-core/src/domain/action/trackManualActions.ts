import type { ClocksState, Context, Duration } from '@datadog/browser-core'
import { clocksNow, combine, generateUUID } from '@datadog/browser-core'
import type { ActionType } from '../../rawRumEvent.types'
import { ActionType as ActionTypeEnum } from '../../rawRumEvent.types'
import { LifeCycleEventType } from '../lifeCycle'
import type { LifeCycle } from '../lifeCycle'
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
  const activeManualActions = new Map<string, ManualActionStart>()

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => activeManualActions.clear())

  function startManualAction(name: string, options: ActionOptions = {}, startClocks = clocksNow()) {
    const lookupKey = options.actionKey ?? name

    const existingAction = activeManualActions.get(lookupKey)
    if (existingAction) {
      existingAction.trackedAction.discard()
      activeManualActions.delete(lookupKey)
    }

    const trackedAction = actionTracker.createTrackedAction(startClocks)

    activeManualActions.set(lookupKey, {
      name,
      type: options.type,
      context: options.context,
      trackedAction,
    })
  }

  function stopManualAction(name: string, options: ActionOptions = {}, stopClocks = clocksNow()) {
    const lookupKey = options.actionKey ?? name
    const activeAction = activeManualActions.get(lookupKey)

    if (!activeAction) {
      return
    }

    activeAction.trackedAction.stop(stopClocks.relative)

    const manualAction: ManualAction = {
      id: activeAction.trackedAction.id,
      name: activeAction.name,
      type: (options.type ?? activeAction.type) || ActionTypeEnum.CUSTOM,
      startClocks: activeAction.trackedAction.startClocks,
      duration: activeAction.trackedAction.duration,
      context: combine(activeAction.context, options.context),
      counts: activeAction.trackedAction.counts,
    }

    onManualActionCompleted(manualAction)
    activeManualActions.delete(lookupKey)
  }

  function addInstantAction(action: Omit<ManualAction, 'id' | 'duration' | 'counts'>) {
    onManualActionCompleted({ id: generateUUID(), ...action })
  }

  function stop() {
    activeManualActions.forEach((activeAction) => activeAction.trackedAction.discard())
    activeManualActions.clear()
  }

  return {
    addAction: addInstantAction,
    startAction: startManualAction,
    stopAction: stopManualAction,
    stop,
  }
}

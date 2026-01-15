import type { ClocksState, Context, Duration } from '@datadog/browser-core'
import { clocksNow, combine } from '@datadog/browser-core'
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

export interface CustomAction {
  id: string
  type: ActionType
  name: string
  startClocks: ClocksState
  duration?: Duration
  context?: Context
  handlingStack?: string
  counts?: ActionCounts
}

interface ActiveCustomAction {
  name: string
  type?: ActionType
  context?: Context
  trackedAction: TrackedAction
}

export function trackCustomActions(
  lifeCycle: LifeCycle,
  actionTracker: ActionTracker,
  onCustomActionCompleted: (action: CustomAction) => void
) {
  const activeCustomActions = new Map<string, ActiveCustomAction>()

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => activeCustomActions.clear())

  function startCustomAction(name: string, options: ActionOptions = {}, startClocks = clocksNow()) {
    const lookupKey = options.actionKey ?? name

    const existingAction = activeCustomActions.get(lookupKey)
    if (existingAction) {
      existingAction.trackedAction.discard()
      activeCustomActions.delete(lookupKey)
    }

    const trackedAction = actionTracker.createTrackedAction(startClocks)

    activeCustomActions.set(lookupKey, {
      name,
      type: options.type,
      context: options.context,
      trackedAction,
    })
  }

  function stopCustomAction(name: string, options: ActionOptions = {}, stopClocks = clocksNow()) {
    const lookupKey = options.actionKey ?? name
    const activeAction = activeCustomActions.get(lookupKey)

    if (!activeAction) {
      return
    }

    activeAction.trackedAction.stop(stopClocks.relative)

    const customAction: CustomAction = {
      id: activeAction.trackedAction.id,
      name: activeAction.name,
      type: (options.type ?? activeAction.type) || ActionTypeEnum.CUSTOM,
      startClocks: activeAction.trackedAction.startClocks,
      duration: activeAction.trackedAction.duration,
      context: combine(activeAction.context, options.context),
      counts: activeAction.trackedAction.counts,
    }

    onCustomActionCompleted(customAction)
    activeCustomActions.delete(lookupKey)
  }

  function stop() {
    activeCustomActions.forEach((activeAction) => activeAction.trackedAction.discard())
    activeCustomActions.clear()
  }

  return {
    startAction: startCustomAction,
    stopAction: stopCustomAction,
    stop,
  }
}

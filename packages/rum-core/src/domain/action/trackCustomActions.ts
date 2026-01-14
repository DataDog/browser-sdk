import type { ClocksState, Context, Duration } from '@datadog/browser-core'
import { clocksNow, combine } from '@datadog/browser-core'
import { ActionType } from '../../rawRumEvent.types'
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
  duration: Duration
  context?: Context
  handlingStack?: string
  counts: ActionCounts
}

export function trackCustomActions(
  lifeCycle: LifeCycle,
  actionTracker: ActionTracker,
  onCustomActionCompleted: (action: CustomAction) => void
) {
  const activeCustomActions = new Map<string, TrackedAction>()

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => activeCustomActions.clear())

  function startCustomAction(name: string, options: ActionOptions = {}, startClocks = clocksNow()) {
    const lookupKey = options.actionKey ?? name

    const existingAction = activeCustomActions.get(lookupKey)
    if (existingAction) {
      existingAction.discard()
      activeCustomActions.delete(lookupKey)
    }

    const trackedAction = actionTracker.createTrackedAction(startClocks, {
      name,
      type: options.type,
      context: options.context,
      actionKey: options.actionKey,
    })

    activeCustomActions.set(lookupKey, trackedAction)
  }

  function stopCustomAction(name: string, options: ActionOptions = {}, stopClocks = clocksNow()) {
    const lookupKey = options.actionKey ?? name
    const trackedAction = activeCustomActions.get(lookupKey)

    if (!trackedAction) {
      return
    }

    trackedAction.stop(stopClocks.relative)

    const customAction: CustomAction = {
      id: trackedAction.id,
      name: trackedAction.name!,
      type: (options.type ?? trackedAction.type) || ActionType.CUSTOM,
      startClocks: trackedAction.startClocks,
      duration: trackedAction.duration!,
      context: combine(trackedAction.context, options.context),
      counts: trackedAction.counts,
    }

    onCustomActionCompleted(customAction)
    activeCustomActions.delete(lookupKey)
  }

  function stop() {
    activeCustomActions.forEach((trackedAction) => trackedAction.discard())
    activeCustomActions.clear()
  }

  return {
    startAction: startCustomAction,
    stopAction: stopCustomAction,
    stop,
  }
}

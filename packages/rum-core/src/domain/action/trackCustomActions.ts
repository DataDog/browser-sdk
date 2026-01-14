import type { ClocksState, Context, Duration } from '@datadog/browser-core'
import {
  clocksNow,
  combine,
  isExperimentalFeatureEnabled,
  ExperimentalFeature,
} from '@datadog/browser-core'
import { ActionType } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
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

interface ActiveCustomAction extends ActionOptions {
  name: string
  trackedAction: TrackedAction
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
  const activeCustomActions = new Map<string, ActiveCustomAction>()

  const { unsubscribe: unsubscribeSessionRenewal } = lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    activeCustomActions.clear()
  })

  function startCustomAction(name: string, options: ActionOptions = {}, startClocks = clocksNow()) {
    if (!isExperimentalFeatureEnabled(ExperimentalFeature.START_STOP_ACTION)) {
      return
    }

    const lookupKey = getActionLookupKey(name, options.actionKey)

    const existingAction = activeCustomActions.get(lookupKey)
    if (existingAction) {
      existingAction.trackedAction.discard()
      activeCustomActions.delete(lookupKey)
    }

    const trackedAction = actionTracker.createTrackedAction(startClocks)

    activeCustomActions.set(lookupKey, {
      name,
      trackedAction,
      type: options.type,
      context: options.context,
      actionKey: options.actionKey,
    })
  }

  function stopCustomAction(name: string, options: ActionOptions = {}, stopClocks = clocksNow()) {
    if (!isExperimentalFeatureEnabled(ExperimentalFeature.START_STOP_ACTION)) {
      return
    }

    const lookupKey = getActionLookupKey(name, options.actionKey)
    const activeAction = activeCustomActions.get(lookupKey)

    if (!activeAction) {
      return
    }

    activeAction.trackedAction.stop(stopClocks.relative)

    const customAction: CustomAction = {
      id: activeAction.trackedAction.id,
      name: activeAction.name,
      type: (options.type ?? activeAction.type) || ActionType.CUSTOM,
      startClocks: activeAction.trackedAction.startClocks,
      duration: activeAction.trackedAction.duration!,
      context: combine(activeAction.context, options.context),
      counts: activeAction.trackedAction.counts,
    }

    onCustomActionCompleted(customAction)
    activeCustomActions.delete(lookupKey)
  }

  function stop() {
    unsubscribeSessionRenewal()
    activeCustomActions.forEach((activeAction) => {
      activeAction.trackedAction.discard()
    })
    activeCustomActions.clear()
  }

  return {
    startAction: startCustomAction,
    stopAction: stopCustomAction,
    stop,
  }
}

function getActionLookupKey(name: string, actionKey?: string): string {
  return JSON.stringify({ name, actionKey })
}


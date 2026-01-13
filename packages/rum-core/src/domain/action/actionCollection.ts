import type { ClocksState, Context, Duration, Observable, RelativeTime } from '@datadog/browser-core'
import {
  noop,
  combine,
  toServerDuration,
  generateUUID,
  SKIPPED,
  HookNames,
  addDuration,
  clocksNow,
  elapsed,
  isExperimentalFeatureEnabled,
  ExperimentalFeature,
} from '@datadog/browser-core'
import { discardNegativeDuration } from '../discardNegativeDuration'
import type { RawRumActionEvent } from '../../rawRumEvent.types'
import { ActionType, RumEventType } from '../../rawRumEvent.types'
import type { LifeCycle, RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { RumConfiguration } from '../configuration'
import type { RumActionEventDomainContext } from '../../domainContext.types'
import type { DefaultRumEventAttributes, DefaultTelemetryEventAttributes, Hooks } from '../hooks'
import type { RumMutationRecord } from '../../browser/domMutationObservable'
import type { ClickAction } from './trackClickActions'
import { trackClickActions } from './trackClickActions'
import type { ActionContexts, ActionCounts, TrackedAction } from './trackAction'
import { startActionTracker } from './trackAction'

export type { ActionContexts }

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

  /**
   * @internal - used to preserve timing for pre-init calls
   */
  startClocks?: ClocksState

  /**
   * @internal - used to preserve timing for pre-init calls
   */
  stopClocks?: ClocksState
}

interface ActiveCustomAction extends ActionOptions {
  name: string
  trackedAction: TrackedAction
}

export interface CustomAction {
  id?: string
  type: ActionType
  name: string
  startClocks: ClocksState
  duration: Duration
  context?: Context
  handlingStack?: string
  counts?: ActionCounts
}

export type AutoAction = ClickAction

export const LONG_TASK_START_TIME_CORRECTION = 1 as Duration

export function startActionCollection(
  lifeCycle: LifeCycle,
  hooks: Hooks,
  domMutationObservable: Observable<RumMutationRecord[]>,
  windowOpenObservable: Observable<void>,
  configuration: RumConfiguration
) {
  // Shared action tracker for both click and custom actions
  const actionTracker = startActionTracker(lifeCycle)
  const activeCustomActions = new Map<string, ActiveCustomAction>()

  const { unsubscribe: unsubscribeAutoAction } = lifeCycle.subscribe(
    LifeCycleEventType.AUTO_ACTION_COMPLETED,
    (action) => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action))
    }
  )

  const { unsubscribe: unsubscribeSessionRenewal } = lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    activeCustomActions.clear()
  })

  let stopClickActions: () => void = noop

  if (configuration.trackUserInteractions) {
    ;({ stop: stopClickActions } = trackClickActions(
      lifeCycle,
      domMutationObservable,
      windowOpenObservable,
      configuration,
      actionTracker
    ))
  }

  const actionContexts: ActionContexts = {
    findActionId: (startTime?: RelativeTime) => actionTracker.findActionId(startTime),
  }

  hooks.register(HookNames.Assemble, ({ startTime, eventType }): DefaultRumEventAttributes | SKIPPED => {
    if (
      eventType !== RumEventType.ERROR &&
      eventType !== RumEventType.RESOURCE &&
      eventType !== RumEventType.LONG_TASK
    ) {
      return SKIPPED
    }

    // Long tasks triggered by interaction handlers (pointerup, click, etc.)
    // can have a start time slightly before the interaction timestamp (long_task.start_time < action.start_time).
    // This likely happens because the interaction timestamp is recorded during the event dispatch,
    // not at the beginning of the rendering frame. I observed a difference of < 1 ms in my tests.
    // Fixes flakiness in test: "associates long tasks to interaction actions"
    const correctedStartTime =
      eventType === RumEventType.LONG_TASK ? addDuration(startTime, LONG_TASK_START_TIME_CORRECTION) : startTime

    const actionId = actionContexts.findActionId(correctedStartTime)

    if (!actionId) {
      return SKIPPED
    }

    return {
      type: eventType,
      action: { id: actionId },
    }
  })

  hooks.register(
    HookNames.AssembleTelemetry,
    ({ startTime }): DefaultTelemetryEventAttributes => ({
      action: { id: actionContexts.findActionId(startTime) as string },
    })
  )

  function startCustomActionInternal(name: string, options: ActionOptions = {}) {
    if (!isExperimentalFeatureEnabled(ExperimentalFeature.START_STOP_ACTION)) {
      return
    }

    const lookupKey = getActionLookupKey(name, options.actionKey)

    const existingAction = activeCustomActions.get(lookupKey)
    if (existingAction) {
      existingAction.trackedAction.discard()
      activeCustomActions.delete(lookupKey)
    }

    const startClocks = options.startClocks ?? clocksNow()
    const trackedAction = actionTracker.createTrackedAction(startClocks)

    activeCustomActions.set(lookupKey, {
      name,
      trackedAction,
      type: options.type,
      context: options.context,
      actionKey: options.actionKey,
    })
  }

  function stopCustomActionInternal(name: string, options: ActionOptions = {}) {
    if (!isExperimentalFeatureEnabled(ExperimentalFeature.START_STOP_ACTION)) {
      return
    }

    const lookupKey = getActionLookupKey(name, options.actionKey)
    const activeAction = activeCustomActions.get(lookupKey)

    if (!activeAction) {
      return
    }

    const stopClocks = options.stopClocks ?? clocksNow()
    const duration = elapsed(activeAction.trackedAction.startClocks.timeStamp, stopClocks.timeStamp)

    activeAction.trackedAction.stop(stopClocks.relative)

    const { errorCount, resourceCount, longTaskCount } = activeAction.trackedAction.eventCounts

    const customAction: CustomAction = {
      id: activeAction.trackedAction.id,
      name: activeAction.name,
      type: (options.type ?? activeAction.type) || ActionType.CUSTOM,
      startClocks: activeAction.trackedAction.startClocks,
      duration,
      context: combine(activeAction.context, options.context),
      counts: { errorCount, resourceCount, longTaskCount },
    }

    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(customAction))
    activeCustomActions.delete(lookupKey)
  }

  return {
    addAction: (action: CustomAction) => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action))
    },
    startAction: startCustomActionInternal,
    stopAction: stopCustomActionInternal,
    actionContexts,
    stop: () => {
      unsubscribeAutoAction()
      unsubscribeSessionRenewal()
      stopClickActions()
      activeCustomActions.forEach((activeAction) => {
        activeAction.trackedAction.discard()
      })
      activeCustomActions.clear()
      actionTracker.stop()
    },
  }
}

function processAction(action: AutoAction | CustomAction): RawRumEventCollectedData<RawRumActionEvent> {
  const actionId = isAutoAction(action) ? action.id : (action.id ?? generateUUID())

  const autoActionProperties = isAutoAction(action)
    ? {
        action: {
          id: actionId,
          loading_time: discardNegativeDuration(toServerDuration(action.duration)),
          frustration: {
            type: action.frustrationTypes,
          },
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
        _dd: {
          action: {
            target: action.target,
            position: action.position,
            name_source: action.nameSource,
          },
        },
      }
    : {
        action: {
          id: actionId,
          // We only include loading_time for timed custom actions (startAction/stopAction)
          // because instant actions (addAction) have duration: 0.
          ...(action.duration > 0 ? { loading_time: toServerDuration(action.duration) } : {}),
          ...(action.counts
            ? {
                error: { count: action.counts.errorCount },
                long_task: { count: action.counts.longTaskCount },
                resource: { count: action.counts.resourceCount },
              }
            : {}),
        },
        context: action.context,
      }

  const actionEvent: RawRumActionEvent = combine(
    {
      action: { target: { name: action.name }, type: action.type },
      date: action.startClocks.timeStamp,
      type: RumEventType.ACTION,
    },
    autoActionProperties
  )

  const duration = action.duration
  const domainContext: RumActionEventDomainContext = isAutoAction(action)
    ? { events: action.events }
    : { handlingStack: action.handlingStack }

  return {
    rawRumEvent: actionEvent,
    duration,
    startTime: action.startClocks.relative,
    domainContext,
  }
}

function isAutoAction(action: AutoAction | CustomAction): action is AutoAction {
  return action.type === ActionType.CLICK && 'events' in action
}

function getActionLookupKey(name: string, actionKey?: string): string {
  return JSON.stringify({ name, actionKey })
}

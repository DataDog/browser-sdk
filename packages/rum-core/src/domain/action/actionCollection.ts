import type { ClocksState, Context, Duration, Observable } from '@datadog/browser-core'
import {
  noop,
  combine,
  toServerDuration,
  generateUUID,
  SKIPPED,
  HookNames,
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
import type { ActionContexts, ClickAction } from './trackClickActions'
import { trackClickActions } from './trackClickActions'

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
}

export interface ActionStart extends ActionOptions {
  name: string
  startClocks: ClocksState
}

export interface CustomActionState {
  actionsByName: Map<string, ActionStart>
}

export function createCustomActionsState() {
  const actionsByName = new Map<string, ActionStart>()
  return { actionsByName }
}

export interface CustomAction {
  type: ActionType
  name: string
  startClocks: ClocksState
  duration: Duration
  context?: Context
  handlingStack?: string
}

export type AutoAction = ClickAction

export function startActionCollection(
  lifeCycle: LifeCycle,
  hooks: Hooks,
  domMutationObservable: Observable<RumMutationRecord[]>,
  windowOpenObservable: Observable<void>,
  configuration: RumConfiguration,
  customActionsState: CustomActionState
) {
  const { unsubscribe: unsubscribeAutoAction } = lifeCycle.subscribe(
    LifeCycleEventType.AUTO_ACTION_COMPLETED,
    (action) => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action))
    }
  )

  hooks.register(HookNames.Assemble, ({ startTime, eventType }): DefaultRumEventAttributes | SKIPPED => {
    if (
      eventType !== RumEventType.ERROR &&
      eventType !== RumEventType.RESOURCE &&
      eventType !== RumEventType.LONG_TASK
    ) {
      return SKIPPED
    }

    const actionId = actionContexts.findActionId(startTime)
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

  let actionContexts: ActionContexts = { findActionId: noop as () => undefined }
  let stop: () => void = noop

  if (configuration.trackUserInteractions) {
    ;({ actionContexts, stop } = trackClickActions(
      lifeCycle,
      domMutationObservable,
      windowOpenObservable,
      configuration
    ))
  }

  function addCustomAction(action: CustomAction) {
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action))
  }

  return {
    addAction: (action: CustomAction) => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action))
    },
    startAction: (name: string, options: ActionOptions = {}) => startCustomAction(customActionsState, name, options),
    stopAction: (name: string, options: ActionOptions = {}) => {
      stopCustomAction(addCustomAction, customActionsState, name, options)
    },
    actionContexts,
    stop: () => {
      unsubscribeAutoAction()
      stop()
    },
  }
}

function processAction(action: AutoAction | CustomAction): RawRumEventCollectedData<RawRumActionEvent> {
  const autoActionProperties = isAutoAction(action)
    ? {
        action: {
          id: action.id,
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
        context: action.context,
      }
  const actionEvent: RawRumActionEvent = combine(
    {
      action: { id: generateUUID(), target: { name: action.name }, type: action.type },
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
  return action.type === ActionType.CLICK
}

function getActionLookupKey(name: string, actionKey?: string): string {
  return actionKey ? `${name}__${actionKey}` : name
}

export function startCustomAction({ actionsByName }: CustomActionState, name: string, options: ActionOptions = {}) {
  if (!isExperimentalFeatureEnabled(ExperimentalFeature.START_STOP_ACTION)) {
    return
  }

  const actionStart: ActionStart = {
    name,
    startClocks: clocksNow(),
    ...options,
  }

  const lookupKey = getActionLookupKey(name, options.actionKey)
  actionsByName.set(lookupKey, actionStart)
}

export function stopCustomAction(
  stopCallback: (action: CustomAction) => void,
  { actionsByName }: CustomActionState,
  name: string,
  options: ActionOptions = {}
) {
  if (!isExperimentalFeatureEnabled(ExperimentalFeature.START_STOP_ACTION)) {
    return
  }

  const lookupKey = getActionLookupKey(name, options.actionKey)
  const actionStart = actionsByName.get(lookupKey)

  if (!actionStart) {
    return
  }

  const stopClocks = clocksNow()
  const duration = elapsed(actionStart.startClocks.timeStamp, stopClocks.timeStamp)

  const customAction: CustomAction = {
    name: actionStart.name,
    type: (options.type ?? actionStart.type) || ActionType.CUSTOM,
    startClocks: actionStart.startClocks,
    duration,
    context: combine(actionStart.context, options.context),
  }

  stopCallback(customAction)

  actionsByName.delete(lookupKey)
}

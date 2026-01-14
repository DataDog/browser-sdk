import type { ClocksState, Context, Duration, Observable } from '@datadog/browser-core'
import { noop, toServerDuration, generateUUID, SKIPPED, HookNames, addDuration } from '@datadog/browser-core'
import { discardNegativeDuration } from '../discardNegativeDuration'
import type { RawRumActionEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { LifeCycle, RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { RumConfiguration } from '../configuration'
import type { RumActionEventDomainContext } from '../../domainContext.types'
import type { DefaultRumEventAttributes, DefaultTelemetryEventAttributes, Hooks } from '../hooks'
import type { RumMutationRecord } from '../../browser/domMutationObservable'
import type { ClickAction } from './trackClickActions'
import { trackClickActions } from './trackClickActions'
import type { ActionContexts } from './trackAction'
import { startActionTracker } from './trackAction'
import type { CustomAction } from './trackCustomActions'
import { trackCustomActions } from './trackCustomActions'

export interface InstantCustomAction {
  type: CustomAction['type']
  name: string
  startClocks: ClocksState
  duration: Duration
  context?: Context
  handlingStack?: string
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

  const { unsubscribe: unsubscribeAutoAction } = lifeCycle.subscribe(
    LifeCycleEventType.AUTO_ACTION_COMPLETED,
    (action) => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action))
    }
  )

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

  const customActions = trackCustomActions(lifeCycle, actionTracker, (action) => {
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action))
  })

  const actionContexts: ActionContexts = {
    findActionId: actionTracker.findActionId,
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

  return {
    addAction: (action: InstantCustomAction) => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processInstantAction(action))
    },
    startAction: customActions.startAction,
    stopAction: customActions.stopAction,
    actionContexts,
    stop: () => {
      unsubscribeAutoAction()
      stopClickActions()
      customActions.stop()
      actionTracker.stop()
    },
  }
}

function processAction(action: AutoAction | CustomAction): RawRumEventCollectedData<RawRumActionEvent> {
  const isAuto = isAutoAction(action)

  const actionEvent: RawRumActionEvent = {
    type: RumEventType.ACTION,
    date: action.startClocks.timeStamp,
    action: {
      id: action.id,
      loading_time: discardNegativeDuration(toServerDuration(action.duration)),
      target: { name: action.name },
      type: action.type,
      ...(action.counts && {
        error: { count: action.counts.errorCount },
        long_task: { count: action.counts.longTaskCount },
        resource: { count: action.counts.resourceCount },
      }),
      frustration: isAuto ? { type: action.frustrationTypes } : undefined,
    },
    context: isAuto ? undefined : action.context,
    _dd: isAuto
      ? {
          action: {
            target: action.target,
            position: action.position,
            name_source: action.nameSource,
          },
        }
      : undefined,
  }

  const domainContext: RumActionEventDomainContext = isAuto
    ? { events: action.events }
    : { handlingStack: action.handlingStack }

  return {
    rawRumEvent: actionEvent,
    duration: action.duration,
    startTime: action.startClocks.relative,
    domainContext,
  }
}

function processInstantAction(action: InstantCustomAction): RawRumEventCollectedData<RawRumActionEvent> {
  const actionEvent: RawRumActionEvent = {
    type: RumEventType.ACTION,
    date: action.startClocks.timeStamp,
    action: {
      id: generateUUID(),
      target: { name: action.name },
      type: action.type,
    },
    context: action.context,
  }

  return {
    rawRumEvent: actionEvent,
    duration: action.duration,
    startTime: action.startClocks.relative,
    domainContext: { handlingStack: action.handlingStack },
  }
}

function isAutoAction(action: AutoAction | CustomAction): action is AutoAction {
  return 'events' in action
}

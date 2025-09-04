import type { ClocksState, Context, Observable } from '@datadog/browser-core'
import { noop, combine, toServerDuration, generateUUID, SKIPPED, HookNames } from '@datadog/browser-core'
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

export interface CustomAction {
  type: typeof ActionType.CUSTOM
  name: string
  startClocks: ClocksState
  context?: Context
  handlingStack?: string
}

export type AutoAction = ClickAction

export function startActionCollection(
  lifeCycle: LifeCycle,
  hooks: Hooks,
  domMutationObservable: Observable<RumMutationRecord[]>,
  windowOpenObservable: Observable<void>,
  configuration: RumConfiguration
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

  return {
    addAction: (action: CustomAction) => {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action))
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

  const duration = isAutoAction(action) ? action.duration : undefined
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
  return action.type !== ActionType.CUSTOM
}

import type { Duration, Observable, RelativeTime } from '@datadog/browser-core'
import { noop, toServerDuration, SKIPPED, HookNames, addDuration } from '@datadog/browser-core'
import { discardNegativeDuration } from '../discardNegativeDuration'
import type { RawRumActionEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { LifeCycle, RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { RumConfiguration } from '../configuration'
import type { DefaultRumEventAttributes, DefaultTelemetryEventAttributes, Hooks } from '../hooks'
import type { RumMutationRecord } from '../../browser/domMutationObservable'
import { trackClickActions } from './trackClickActions'
import type { ClickAction } from './trackClickActions'
import { trackManualActions } from './trackManualActions'
import type { ManualAction } from './trackManualActions'

export type AutoAction = ClickAction

export interface ActionContexts {
  findActionId: (startTime?: RelativeTime) => string[]
}

export const LONG_TASK_START_TIME_CORRECTION = 1 as Duration

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

  const stopClickActions: () => void = noop
  let clickActions: ReturnType<typeof trackClickActions> | undefined

  if (configuration.trackUserInteractions) {
    clickActions = trackClickActions(lifeCycle, domMutationObservable, windowOpenObservable, configuration)
  }

  const manualActions = trackManualActions(lifeCycle, (action) => {
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action))
  })

  const actionContexts: ActionContexts = {
    findActionId: (startTime?: RelativeTime) => {
      const manualActionId = manualActions.findActionId(startTime)
      const clickActionId = clickActions?.findActionId(startTime) ?? []
      return manualActionId.concat(clickActionId)
    },
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

    if (!actionId.length) {
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
      // todo: fix telemetry event type
      action: { id: actionContexts.findActionId(startTime) as unknown as string },
    })
  )

  return {
    addAction: manualActions.addAction,
    startAction: manualActions.startAction,
    stopAction: manualActions.stopAction,
    actionContexts,
    stop: () => {
      unsubscribeAutoAction()
      stopClickActions()
      manualActions.stop()
      clickActions?.stop()
    },
  }
}

function processAction(action: AutoAction | ManualAction): RawRumEventCollectedData<RawRumActionEvent> {
  const isAuto = isAutoAction(action)
  const loadingTime = discardNegativeDuration(toServerDuration(action.duration))

  return {
    rawRumEvent: {
      type: RumEventType.ACTION,
      date: action.startClocks.timeStamp,
      action: {
        id: action.id,
        target: { name: action.name },
        type: action.type,
        ...(loadingTime !== undefined && { loading_time: loadingTime }),
        ...(action.counts && {
          error: { count: action.counts.errorCount },
          long_task: { count: action.counts.longTaskCount },
          resource: { count: action.counts.resourceCount },
        }),
        frustration: { type: action.frustrationTypes },
      },
      ...(isAuto
        ? {
            _dd: {
              action: {
                target: action.target,
                position: action.position,
                name_source: action.nameSource,
              },
            },
          }
        : { context: action.context }),
    },
    duration: action.duration,
    startClocks: action.startClocks,
    domainContext: isAuto ? { events: action.events } : { handlingStack: action.handlingStack },
  }
}

function isAutoAction(action: AutoAction | ManualAction): action is AutoAction {
  return 'events' in action
}

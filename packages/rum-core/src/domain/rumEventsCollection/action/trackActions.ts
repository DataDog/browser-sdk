import type { Context, Duration, ClocksState, Observable } from '@datadog/browser-core'
import {
  assign,
  addEventListener,
  DOM_EVENT,
  generateUUID,
  clocksNow,
  ONE_SECOND,
  elapsed,
} from '@datadog/browser-core'
import { ActionType } from '../../../rawRumEvent.types'
import type { RumConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import { trackEventCounts } from '../../trackEventCounts'
import { waitIdlePage } from '../../waitIdlePage'
import { getActionNameFromElement } from './getActionNameFromElement'

type AutoActionType = ActionType.CLICK

export interface ActionCounts {
  errorCount: number
  longTaskCount: number
  resourceCount: number
}

export interface CustomAction {
  type: ActionType.CUSTOM
  name: string
  startClocks: ClocksState
  context?: Context
}

export interface AutoAction {
  type: AutoActionType
  id: string
  name: string
  startClocks: ClocksState
  duration: Duration
  counts: ActionCounts
  event: Event
}

export interface AutoActionCreatedEvent {
  id: string
  startClocks: ClocksState
}

export interface AutoActionDiscardedEvent {
  id: string
}

// Maximum duration for automatic actions
export const AUTO_ACTION_MAX_DURATION = 10 * ONE_SECOND

export function trackActions(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  { actionNameAttribute }: RumConfiguration
) {
  const action = startActionManagement(lifeCycle, domMutationObservable)

  // New views trigger the discard of the current pending Action
  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, () => {
    action.discardCurrent()
  })

  const { stop: stopListener } = addEventListener(
    window,
    DOM_EVENT.CLICK,
    (event) => {
      if (!(event.target instanceof Element)) {
        return
      }
      const name = getActionNameFromElement(event.target, actionNameAttribute)
      if (!name) {
        return
      }

      action.create(ActionType.CLICK, name, event)
    },
    { capture: true }
  )

  return {
    stop() {
      action.discardCurrent()
      stopListener()
    },
  }
}

function startActionManagement(lifeCycle: LifeCycle, domMutationObservable: Observable<void>) {
  let currentAction: { discard(): void } | undefined

  return {
    create: (type: AutoActionType, name: string, event: Event) => {
      if (currentAction) {
        // Ignore any new action if another one is already occurring.
        return
      }
      currentAction = createAutoAction(lifeCycle, domMutationObservable, { type, name, event }, () => {
        currentAction = undefined
      })
    },
    discardCurrent: () => {
      if (currentAction) {
        currentAction.discard()
      }
    },
  }
}

function createAutoAction(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  base: Pick<AutoAction, 'type' | 'name' | 'event'>,
  onFinishCallback: () => void
) {
  const id = generateUUID()
  const startClocks = clocksNow()
  const eventCountsSubscription = trackEventCounts(lifeCycle)
  const { stop: stopWaitingIdlePage } = waitIdlePage(
    lifeCycle,
    domMutationObservable,
    (event) => {
      if (event.hadActivity) {
        const duration = elapsed(startClocks.timeStamp, event.end)
        if (duration >= 0) {
          complete(duration)
        } else {
          discard()
        }
      } else {
        discard()
      }
    },
    AUTO_ACTION_MAX_DURATION
  )
  lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { id, startClocks })

  function complete(duration: Duration) {
    const eventCounts = eventCountsSubscription.eventCounts
    lifeCycle.notify(
      LifeCycleEventType.AUTO_ACTION_COMPLETED,
      assign(
        {
          counts: {
            errorCount: eventCounts.errorCount,
            longTaskCount: eventCounts.longTaskCount,
            resourceCount: eventCounts.resourceCount,
          },
          duration,
          id,
          startClocks,
        },
        base
      )
    )
    finish()
  }

  function discard() {
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_DISCARDED, { id })
    finish()
  }

  function finish() {
    stopWaitingIdlePage()
    eventCountsSubscription.stop()
    onFinishCallback()
  }

  return { discard }
}

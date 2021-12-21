import {
  addEventListener,
  Context,
  DOM_EVENT,
  Duration,
  generateUUID,
  ClocksState,
  clocksNow,
  ONE_SECOND,
  Observable,
} from '@datadog/browser-core'
import { ActionType } from '../../../rawRumEvent.types'
import { RumConfiguration } from '../../configuration'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { EventCounts, trackEventCounts } from '../../trackEventCounts'
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
  let currentAction: PendingAutoAction | undefined
  let stopWaitingIdlePage: () => void

  return {
    create: (type: AutoActionType, name: string, event: Event) => {
      if (currentAction) {
        // Ignore any new action if another one is already occurring.
        return
      }
      const pendingAutoAction = new PendingAutoAction(lifeCycle, type, name, event)
      currentAction = pendingAutoAction
      ;({ stop: stopWaitingIdlePage } = waitIdlePage(
        lifeCycle,
        domMutationObservable,
        (event) => {
          if (event.hadActivity && event.duration >= 0) {
            pendingAutoAction.complete(event.duration)
          } else {
            pendingAutoAction.discard()
          }
          currentAction = undefined
        },
        AUTO_ACTION_MAX_DURATION
      ))
    },
    discardCurrent: () => {
      if (currentAction) {
        stopWaitingIdlePage()
        currentAction.discard()
        currentAction = undefined
      }
    },
  }
}

class PendingAutoAction {
  startClocks: ClocksState
  private id: string
  private eventCountsSubscription: { eventCounts: EventCounts; stop(): void }

  constructor(private lifeCycle: LifeCycle, private type: AutoActionType, private name: string, private event: Event) {
    this.id = generateUUID()
    this.startClocks = clocksNow()
    this.eventCountsSubscription = trackEventCounts(lifeCycle)
    this.lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { id: this.id, startClocks: this.startClocks })
  }

  complete(duration: Duration) {
    const eventCounts = this.eventCountsSubscription.eventCounts
    this.lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, {
      counts: {
        errorCount: eventCounts.errorCount,
        longTaskCount: eventCounts.longTaskCount,
        resourceCount: eventCounts.resourceCount,
      },
      duration,
      id: this.id,
      name: this.name,
      startClocks: this.startClocks,
      type: this.type,
      event: this.event,
    })
    this.eventCountsSubscription.stop()
  }

  discard() {
    this.lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_DISCARDED)
    this.eventCountsSubscription.stop()
  }
}

import {
  addEventListener,
  Context,
  DOM_EVENT,
  Duration,
  elapsed,
  generateUUID,
  relativeNow,
  RelativeTime,
} from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { EventCounts, trackEventCounts } from '../../trackEventCounts'
import { waitIdlePageActivity } from '../../trackPageActivities'
import { ActionType } from '../../../rawRumEvent.types'
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
  startTime: RelativeTime
  context?: Context
}

export interface AutoAction {
  type: AutoActionType
  id: string
  name: string
  startTime: RelativeTime
  duration: Duration
  counts: ActionCounts
}

export interface AutoActionCreatedEvent {
  id: string
  startTime: RelativeTime
}

export function trackActions(lifeCycle: LifeCycle) {
  const action = startActionManagement(lifeCycle)

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
      const name = getActionNameFromElement(event.target)
      if (!name) {
        return
      }

      action.create(ActionType.CLICK, name)
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

function startActionManagement(lifeCycle: LifeCycle) {
  let currentAction: PendingAutoAction | undefined
  let currentIdlePageActivitySubscription: { stop: () => void }

  return {
    create: (type: AutoActionType, name: string) => {
      if (currentAction) {
        // Ignore any new action if another one is already occurring.
        return
      }
      const pendingAutoAction = new PendingAutoAction(lifeCycle, type, name)

      currentAction = pendingAutoAction
      currentIdlePageActivitySubscription = waitIdlePageActivity(lifeCycle, (hadActivity, endTime) => {
        if (hadActivity) {
          pendingAutoAction.complete(endTime)
        } else {
          pendingAutoAction.discard()
        }
        currentAction = undefined
      })
    },
    discardCurrent: () => {
      if (currentAction) {
        currentIdlePageActivitySubscription.stop()
        currentAction.discard()
        currentAction = undefined
      }
    },
  }
}

class PendingAutoAction {
  private id: string
  private startTime: RelativeTime
  private eventCountsSubscription: { eventCounts: EventCounts; stop(): void }

  constructor(private lifeCycle: LifeCycle, private type: AutoActionType, private name: string) {
    this.id = generateUUID()
    this.startTime = relativeNow()
    this.eventCountsSubscription = trackEventCounts(lifeCycle)
    this.lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { id: this.id, startTime: this.startTime })
  }

  complete(endTime: RelativeTime) {
    const eventCounts = this.eventCountsSubscription.eventCounts
    this.lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, {
      counts: {
        errorCount: eventCounts.errorCount,
        longTaskCount: eventCounts.longTaskCount,
        resourceCount: eventCounts.resourceCount,
      },
      duration: elapsed(this.startTime, endTime),
      id: this.id,
      name: this.name,
      startTime: this.startTime,
      type: this.type,
    })
    this.eventCountsSubscription.stop()
  }

  discard() {
    this.lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_DISCARDED)
    this.eventCountsSubscription.stop()
  }
}

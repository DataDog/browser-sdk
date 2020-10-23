import { Context, DOM_EVENT, generateUUID } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { EventCounts, trackEventCounts } from '../../trackEventCounts'
import { waitIdlePageActivity } from '../../trackPageActivities'
import { getActionNameFromElement } from './getActionNameFromElement'

export enum ActionType {
  CLICK = 'click',
  CUSTOM = 'custom',
}

type AutoActionType = ActionType.CLICK

export interface ActionCounts {
  errorCount: number
  longTaskCount: number
  resourceCount: number
}

export interface CustomAction {
  type: ActionType.CUSTOM
  name: string
  startTime: number
  context?: Context
}

export interface AutoAction {
  type: AutoActionType
  id: string
  name: string
  startTime: number
  duration: number
  measures: ActionCounts
}

export interface AutoActionCreatedEvent {
  id: string
  startTime: number
}

export function startActionCollection(lifeCycle: LifeCycle) {
  const action = startActionManagement(lifeCycle)

  // New views trigger the discard of the current pending Action
  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, () => {
    action.discardCurrent()
  })

  addEventListener(DOM_EVENT.CLICK, processClick, { capture: true })
  function processClick(event: Event) {
    if (!(event.target instanceof Element)) {
      return
    }
    const name = getActionNameFromElement(event.target)
    if (!name) {
      return
    }

    action.create(ActionType.CLICK, name)
  }

  return {
    stop() {
      action.discardCurrent()
      removeEventListener(DOM_EVENT.CLICK, processClick, { capture: true })
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
  private startTime: number
  private eventCountsSubscription: { eventCounts: EventCounts; stop(): void }

  constructor(private lifeCycle: LifeCycle, private type: AutoActionType, private name: string) {
    this.id = generateUUID()
    this.startTime = performance.now()
    this.eventCountsSubscription = trackEventCounts(lifeCycle)
    this.lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { id: this.id, startTime: this.startTime })
  }

  complete(endTime: number) {
    const eventCounts = this.eventCountsSubscription.eventCounts
    this.lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, {
      duration: endTime - this.startTime,
      id: this.id,
      measures: {
        errorCount: eventCounts.errorCount,
        longTaskCount: eventCounts.longTaskCount,
        resourceCount: eventCounts.resourceCount,
      },
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

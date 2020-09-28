import { Context, DOM_EVENT, generateUUID } from '@datadog/browser-core'
import { getActionNameFromElement } from './getActionNameFromElement'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { EventCounts, trackEventCounts } from './trackEventCounts'
import { waitIdlePageActivity } from './trackPageActivities'

export enum UserActionType {
  CLICK = 'click',
  CUSTOM = 'custom',
}

type AutoUserActionType = UserActionType.CLICK

export interface UserActionMeasures {
  errorCount: number
  longTaskCount: number
  resourceCount: number
}

export interface CustomUserAction {
  type: UserActionType.CUSTOM
  name: string
  startTime: number
  context?: Context
}

export interface AutoUserAction {
  type: AutoUserActionType
  id: string
  name: string
  startTime: number
  duration: number
  measures: UserActionMeasures
}

export interface AutoActionCreatedEvent {
  id: string
  startTime: number
}

export function startUserActionCollection(lifeCycle: LifeCycle) {
  const userAction = startUserActionManagement(lifeCycle)

  // New views trigger the discard of the current pending User Action
  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, () => {
    userAction.discardCurrent()
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

    userAction.create(UserActionType.CLICK, name)
  }

  return {
    stop() {
      userAction.discardCurrent()
      removeEventListener(DOM_EVENT.CLICK, processClick, { capture: true })
    },
  }
}

function startUserActionManagement(lifeCycle: LifeCycle) {
  let currentUserAction: PendingAutoUserAction | undefined
  let currentIdlePageActivitySubscription: { stop: () => void }

  return {
    create: (type: AutoUserActionType, name: string) => {
      if (currentUserAction) {
        // Ignore any new user action if another one is already occurring.
        return
      }
      const pendingAutoUserAction = new PendingAutoUserAction(lifeCycle, type, name)

      currentUserAction = pendingAutoUserAction
      currentIdlePageActivitySubscription = waitIdlePageActivity(lifeCycle, (hadActivity, endTime) => {
        if (hadActivity) {
          pendingAutoUserAction.complete(endTime)
        } else {
          pendingAutoUserAction.discard()
        }
        currentUserAction = undefined
      })
    },
    discardCurrent: () => {
      if (currentUserAction) {
        currentIdlePageActivitySubscription.stop()
        currentUserAction.discard()
        currentUserAction = undefined
      }
    },
  }
}

class PendingAutoUserAction {
  private id: string
  private startTime: number
  private eventCountsSubscription: { eventCounts: EventCounts; stop(): void }

  constructor(private lifeCycle: LifeCycle, private type: AutoUserActionType, private name: string) {
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

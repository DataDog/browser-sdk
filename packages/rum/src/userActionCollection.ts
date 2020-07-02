import { Context, DOM_EVENT, generateUUID } from '@datadog/browser-core'
import { getActionNameFromElement } from './getActionNameFromElement'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { trackEventCounts } from './trackEventCounts'
import { waitIdlePageActivity } from './trackPageActivities'

export enum UserActionType {
  CLICK = 'click',
  CUSTOM = 'custom',
}

export interface UserActionMeasures {
  errorCount: number
  longTaskCount: number
  resourceCount: number
}

interface CustomUserAction {
  type: UserActionType.CUSTOM
  name: string
  context?: Context
}

export interface AutoUserAction {
  type: UserActionType.CLICK
  id: string
  name: string
  startTime: number
  duration: number
  measures: UserActionMeasures
}

export type UserAction = CustomUserAction | AutoUserAction

interface PendingAutoUserAction {
  id: string
  startTime: number
  complete(endTime: number): void
  discard(): void
  stop(): void
}
let pendingAutoUserAction: PendingAutoUserAction | undefined

export function startUserActionCollection(lifeCycle: LifeCycle) {
  addEventListener(DOM_EVENT.CLICK, processClick, { capture: true })
  function processClick(event: Event) {
    if (!(event.target instanceof Element)) {
      return
    }
    const name = getActionNameFromElement(event.target)
    if (!name) {
      return
    }
    newUserAction(lifeCycle, UserActionType.CLICK, name)
  }

  // New views trigger the discard of the current pending User Action
  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, () => {
    if (pendingAutoUserAction) {
      pendingAutoUserAction.discard()
    }
  })

  return {
    stop() {
      if (pendingAutoUserAction) {
        pendingAutoUserAction.discard()
      }
      removeEventListener(DOM_EVENT.CLICK, processClick, { capture: true })
    },
  }
}

function newUserAction(lifeCycle: LifeCycle, type: UserActionType, name: string) {
  if (pendingAutoUserAction) {
    // Ignore any new user action if another one is already occurring.
    return
  }

  const id = generateUUID()
  const startTime = performance.now()

  lifeCycle.notify(LifeCycleEventType.ACTION_CREATED)

  const { eventCounts, stop: stopEventCountsTracking } = trackEventCounts(lifeCycle)

  const { stop: stopWaitIdlePageActivity } = waitIdlePageActivity(lifeCycle, (hadActivity, endTime) => {
    if (!pendingAutoUserAction) {
      return
    }
    if (hadActivity) {
      pendingAutoUserAction.complete(endTime)
    } else {
      pendingAutoUserAction.discard()
    }
  })

  pendingAutoUserAction = {
    id,
    startTime,
    complete(endTime: number) {
      lifeCycle.notify(LifeCycleEventType.ACTION_COMPLETED, {
        id,
        name,
        startTime,
        type,
        duration: endTime - startTime,
        measures: {
          errorCount: eventCounts.errorCount,
          longTaskCount: eventCounts.longTaskCount,
          resourceCount: eventCounts.resourceCount,
        },
      })
      this.stop()
    },
    discard() {
      lifeCycle.notify(LifeCycleEventType.ACTION_DISCARDED)
      this.stop()
    },
    stop() {
      stopEventCountsTracking()
      stopWaitIdlePageActivity()
      pendingAutoUserAction = undefined
    },
  }
}

export interface UserActionReference {
  id: string
}
export function getUserActionReference(time?: number): UserActionReference | undefined {
  if (!pendingAutoUserAction || (time !== undefined && time < pendingAutoUserAction.startTime)) {
    return undefined
  }

  return { id: pendingAutoUserAction.id }
}

export const $$tests = {
  newUserAction,
  resetUserAction() {
    pendingAutoUserAction = undefined
  },
}

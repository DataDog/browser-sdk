import { Context, DOM_EVENT, generateUUID, msToNs } from '@datadog/browser-core'
import { getElementContent } from './getElementContent'
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
  stop(): void
}
let pendingAutoUserAction: PendingAutoUserAction | undefined

export function startUserActionCollection(lifeCycle: LifeCycle) {
  addEventListener(DOM_EVENT.CLICK, processClick, { capture: true })
  function processClick(event: Event) {
    if (!(event.target instanceof Element)) {
      return
    }
    newUserAction(lifeCycle, UserActionType.CLICK, getElementContent(event.target))
  }

  // New views trigger the cancellation of the current pending User Action
  lifeCycle.subscribe(LifeCycleEventType.VIEW_COLLECTED, () => {
    if (pendingAutoUserAction) {
      pendingAutoUserAction.stop()
    }
  })

  return {
    stop() {
      if (pendingAutoUserAction) {
        pendingAutoUserAction.stop()
      }
      removeEventListener(DOM_EVENT.CLICK, processClick, { capture: true })
    },
  }
}

function newUserAction(lifeCycle: LifeCycle, type: UserActionType, name: string) {
  if (pendingAutoUserAction) {
    // Discard any new user action if another one is already occurring.
    return
  }

  const id = generateUUID()
  const startTime = performance.now()

  const { eventCounts, stop: stopEventCountsTracking } = trackEventCounts(lifeCycle)

  const { stop: stopWaitIdlePageActivity } = waitIdlePageActivity(lifeCycle, (hadActivity, endTime) => {
    if (hadActivity) {
      lifeCycle.notify(LifeCycleEventType.USER_ACTION_COLLECTED, {
        id,
        name,
        startTime,
        type,
        duration: msToNs(endTime - startTime),
        measures: {
          errorCount: eventCounts.errorCount,
          longTaskCount: eventCounts.longTaskCount,
          resourceCount: eventCounts.resourceCount,
        },
      })
    }

    stopEventCountsTracking()
    pendingAutoUserAction = undefined
  })

  pendingAutoUserAction = {
    id,
    startTime,
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

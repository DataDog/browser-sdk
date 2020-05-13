import { Context, DOM_EVENT, generateUUID, noop } from '@datadog/browser-core'
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
}
export let pendingAutoUserAction: PendingAutoUserAction | undefined

export let stopPendingAutoUserAction: { stop(): void } = {
  stop: noop,
}

export function startUserActionCollection(lifeCycle: LifeCycle) {
  addEventListener(DOM_EVENT.CLICK, processClick, { capture: true })
  function processClick(event: Event) {
    if (!(event.target instanceof Element)) {
      return
    }
    stopPendingAutoUserAction = newUserAction(lifeCycle, UserActionType.CLICK, getElementContent(event.target))
  }

  return {
    stop() {
      stopPendingAutoUserAction.stop()
      removeEventListener(DOM_EVENT.CLICK, processClick, { capture: true })
    },
  }
}

function newUserAction(lifeCycle: LifeCycle, type: UserActionType, name: string): { stop(): void } {
  if (pendingAutoUserAction) {
    // Discard any new user action if another one is already occurring.
    return { stop: stopPendingAutoUserAction.stop }
  }

  const id = generateUUID()
  const startTime = performance.now()

  const { eventCounts, stop: stopEventCountsTracking } = trackEventCounts(lifeCycle)

  function stopUserAction() {
    stopEventCountsTracking()
    pendingAutoUserAction = undefined
  }

  const { stop: stopWaitIdlePageActivity } = waitIdlePageActivity(lifeCycle, (hadActivity, endTime) => {
    if (hadActivity) {
      lifeCycle.notify(LifeCycleEventType.USER_ACTION_COLLECTED, {
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
    }
    stopUserAction()
  })

  function stop() {
    stopUserAction()
    stopWaitIdlePageActivity()
  }

  pendingAutoUserAction = {
    id,
    startTime,
  }

  return { stop }
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

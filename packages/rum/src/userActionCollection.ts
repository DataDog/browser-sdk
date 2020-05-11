import { Context, DOM_EVENT, generateUUID, noop } from '@datadog/browser-core'
import { getElementContent } from './getElementContent'
import { LifeCycle, LifeCycleEventType, Subscription } from './lifeCycle'
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

export function stopCurrentUserAction() {
  if (currentUserAction) {
    currentUserAction.stop()
  }
}

export function startUserActionCollection(lifeCycle: LifeCycle) {
  let stopNewUserAction: { stop(): void }
  addEventListener(DOM_EVENT.CLICK, processClick, { capture: true })
  function processClick(event: Event) {
    if (!(event.target instanceof Element)) {
      return
    }
    stopNewUserAction = newUserAction(lifeCycle, UserActionType.CLICK, getElementContent(event.target))
  }

  return {
    stop() {
      stopNewUserAction.stop()
      removeEventListener(DOM_EVENT.CLICK, processClick, { capture: true })
    },
  }
}

interface PendingAutoUserAction {
  id: string
  startTime: number
  stop(): void
}
export let currentUserAction: PendingAutoUserAction | undefined

function newUserAction(lifeCycle: LifeCycle, type: UserActionType, name: string): { stop(): void } {
  if (currentUserAction) {
    // Discard any new click user action if another one is already occuring.
    return { stop: currentUserAction.stop }
  }

  const id = generateUUID()
  const startTime = performance.now()

  const { eventCounts, stop: stopEventCountsTracking } = trackEventCounts(lifeCycle)

  waitIdlePageActivity(lifeCycle, (endTime) => {
    stopEventCountsTracking()
    if (endTime !== undefined && currentUserAction !== undefined && currentUserAction.id === id) {
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
    currentUserAction = undefined
  })

  function stop() {
    stopEventCountsTracking()
    currentUserAction = undefined
  }

  currentUserAction = {
    id,
    startTime,
    stop,
  }

  return { stop }
}

export interface UserActionReference {
  id: string
}
export function getUserActionReference(time?: number): UserActionReference | undefined {
  if (!currentUserAction || (time !== undefined && time < currentUserAction.startTime)) {
    return undefined
  }

  return { id: currentUserAction.id }
}

export const $$tests = {
  newUserAction,
  resetUserAction() {
    currentUserAction = undefined
  },
}

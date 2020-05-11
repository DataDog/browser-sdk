import { Context, DOM_EVENT, generateUUID, noop } from '@datadog/browser-core'
import { getElementContent } from './getElementContent'
import { LifeCycle, LifeCycleEventType, Subscription } from './lifeCycle'
import { trackEventCounts } from './trackEventCounts'
import { waitIdlePageActivity } from './trackPageActivities'

// Automatic user action collection lifecycle overview:
//                        (Start new user action)
//              .-------------------'--------------------.
//              v                                        v
//     [Wait for a page activity ]          [Wait for a maximum duration]
//     [timeout: VALIDATION_DELAY]          [  timeout: MAX_DURATION    ]
//          /                  \                           |
//         v                    v                          |
//  [No page activity]   [Page activity]                   |
//         |                   |,----------------------.   |
//         v                   v                       |   |
//     (Discard)     [Wait for a page activity]        |   |
//                   [   timeout: END_DELAY   ]        |   |
//                       /                \            |   |
//                      v                  v           |   |
//             [No page activity]    [Page activity]   |   |
//                      |                 |            |   |
//                      |                 '------------'   |
//                      '-----------. ,--------------------'
//                                   v
//                                 (End)
//
// Note: because MAX_DURATION > VALIDATION_DELAY, we are sure that if the user action is still alive
// after MAX_DURATION, it has been validated.

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

export let currentUserActionProcess = { stop: noop }

export function startUserActionCollection(lifeCycle: LifeCycle) {
  const subscriptions: Subscription[] = []

  addEventListener(DOM_EVENT.CLICK, processClick, { capture: true })
  function processClick(event: Event) {
    if (!(event.target instanceof Element)) {
      return
    }
    currentUserActionProcess = newUserAction(lifeCycle, UserActionType.CLICK, getElementContent(event.target))
  }

  return {
    stop() {
      currentUserActionProcess.stop()
      removeEventListener(DOM_EVENT.CLICK, processClick, { capture: true })
      subscriptions.forEach((s) => s.unsubscribe())
    },
  }
}

interface PendingAutoUserAction {
  id: string
  startTime: number
}
let currentUserAction: PendingAutoUserAction | undefined

function newUserAction(lifeCycle: LifeCycle, type: UserActionType, name: string): { stop(): void } {
  if (currentUserAction) {
    // Discard any new click user action if another one is already occuring.
    return { stop: currentUserActionProcess.stop }
  }

  const id = generateUUID()
  const startTime = performance.now()
  currentUserAction = { id, startTime }

  const { eventCounts, stop: stopEventCountsTracking } = trackEventCounts(lifeCycle)

  waitIdlePageActivity(lifeCycle, (endTime) => {
    stopEventCountsTracking()
    if (endTime !== undefined && currentUserAction !== undefined && currentUserAction.id === id) {
      lifeCycle.notify(LifeCycleEventType.USER_ACTION_COLLECTED, {
        id,
        name,
        type,
        duration: endTime - currentUserAction.startTime,
        measures: {
          errorCount: eventCounts.errorCount,
          longTaskCount: eventCounts.longTaskCount,
          resourceCount: eventCounts.resourceCount,
        },
        startTime: currentUserAction.startTime,
      })
    }
    currentUserAction = undefined
  })

  function stop() {
    stopEventCountsTracking()
    currentUserAction = undefined
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

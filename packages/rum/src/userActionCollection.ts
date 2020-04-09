import { Context, DOM_EVENT, generateUUID, monitor, Observable } from '@datadog/browser-core'
import { getElementContent } from './getElementContent'
import { LifeCycle, LifeCycleEventType, Subscription } from './lifeCycle'
import { trackEventCounts } from './trackEventCounts'

// Automatic user action collection lifecycle overview:
//
//                               (Start)
//                   .--------------'----------------------.
//                   v                                     v
//     [Wait for a page activity ]          [Wait for a maximum duration]
//     [timeout: VALIDATION_DELAY]          [  timeout: MAX_DURATION    ]
//          /                  \                           |
//         v                   v                           |
//  [No page activity]   [Page activity]                   |
//         |                   |,----------------------.   |
//         v                   v                       |   |
//     (Discard)     [Wait for a page activity]        |   |
//                   [   timeout: END_DELAY   ]        |   |
//                       /                \            |   |
//                      v                 v            |   |
//             [No page activity]    [Page activity]   |   |
//                      |                 |            |   |
//                      |                 '------------'   |
//                      '-----------. ,--------------------'
//                                   v
//                                 (End)
//
// Note: because MAX_DURATION > VALIDATION_DELAY, we are sure that if the user action is still alive
// after MAX_DURATION, it has been validated.

// Delay to wait for a page activity to validate the user action
const USER_ACTION_VALIDATION_DELAY = 100
// Delay to wait after a page activity to end the user action
const USER_ACTION_END_DELAY = 100
// Maximum duration of a user action
export const USER_ACTION_MAX_DURATION = 10_000

export enum UserActionType {
  CLICK = 'click',
  LOAD_VIEW = 'load_view',
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
  type: UserActionType.LOAD_VIEW | UserActionType.CLICK
  id: string
  name: string
  startTime: number
  duration: number
  measures: UserActionMeasures
}

export type UserAction = CustomUserAction | AutoUserAction

export function startUserActionCollection(lifeCycle: LifeCycle) {
  function processClick(event: Event) {
    if (!(event.target instanceof Element)) {
      return
    }

    newUserAction(lifeCycle, UserActionType.CLICK, getElementContent(event.target))
  }

  addEventListener(DOM_EVENT.CLICK, processClick, { capture: true })

  return {
    stop() {
      removeEventListener(DOM_EVENT.CLICK, processClick, { capture: true })
    },
  }
}

let currentUserAction: { id: string; startTime: number } | undefined

function newUserAction(lifeCycle: LifeCycle, type: UserActionType, name: string) {
  if (currentUserAction) {
    // Discard any new user action if another one is already occuring.
    return
  }

  const id = generateUUID()
  const startTime = performance.now()
  currentUserAction = { id, startTime }

  const { observable: pageActivitiesObservable, stop: stopPageActivitiesTracking } = trackPageActivities(lifeCycle)
  const { eventCounts, stop: stopEventCountsTracking } = trackEventCounts(lifeCycle)

  waitUserActionCompletion(pageActivitiesObservable, (endTime) => {
    stopPageActivitiesTracking()
    stopEventCountsTracking()
    if (endTime !== undefined) {
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
  })
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

export interface PageActivityEvent {
  isBusy: boolean
}

function trackPageActivities(lifeCycle: LifeCycle): { observable: Observable<PageActivityEvent>; stop(): void } {
  const observable = new Observable<PageActivityEvent>()
  const subscriptions: Subscription[] = []
  let firstRequestId: undefined | number
  let pendingRequestsCount = 0

  subscriptions.push(lifeCycle.subscribe(LifeCycleEventType.DOM_MUTATED, () => notifyPageActivity()))

  subscriptions.push(
    lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
      if (entry.entryType !== 'resource') {
        return
      }

      notifyPageActivity()
    })
  )

  subscriptions.push(
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_STARTED, (startEvent) => {
      if (firstRequestId === undefined) {
        firstRequestId = startEvent.requestId
      }

      pendingRequestsCount += 1
      notifyPageActivity()
    })
  )

  subscriptions.push(
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, (request) => {
      // If the request started before the tracking start, ignore it
      if (firstRequestId === undefined || request.requestId < firstRequestId) {
        return
      }
      pendingRequestsCount -= 1
      notifyPageActivity()
    })
  )

  function notifyPageActivity() {
    observable.notify({ isBusy: pendingRequestsCount > 0 })
  }

  return {
    observable,
    stop() {
      subscriptions.forEach((s) => s.unsubscribe())
    },
  }
}

function waitUserActionCompletion(
  pageActivitiesObservable: Observable<PageActivityEvent>,
  completionCallback: (endTime: number | undefined) => void
) {
  let idleTimeoutId: ReturnType<typeof setTimeout>
  let hasCompleted = false

  const validationTimeoutId = setTimeout(monitor(() => complete(undefined)), USER_ACTION_VALIDATION_DELAY)
  const maxDurationTimeoutId = setTimeout(monitor(() => complete(performance.now())), USER_ACTION_MAX_DURATION)

  pageActivitiesObservable.subscribe(({ isBusy }) => {
    clearTimeout(validationTimeoutId)
    clearTimeout(idleTimeoutId)
    const lastChangeTime = performance.now()
    if (!isBusy) {
      idleTimeoutId = setTimeout(monitor(() => complete(lastChangeTime)), USER_ACTION_END_DELAY)
    }
  })

  function complete(endTime: number | undefined) {
    if (hasCompleted) {
      return
    }
    hasCompleted = true
    clearTimeout(validationTimeoutId)
    clearTimeout(idleTimeoutId)
    clearTimeout(maxDurationTimeoutId)
    currentUserAction = undefined
    completionCallback(endTime)
  }
}

export const $$tests = {
  newUserAction,
  trackPageActivities,
  resetUserAction() {
    currentUserAction = undefined
  },
  waitUserActionCompletion,
}

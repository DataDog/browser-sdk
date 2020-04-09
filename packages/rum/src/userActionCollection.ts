import { DOM_EVENT, generateUUID, monitor, Observable } from '@datadog/browser-core'
import { getElementContent } from './getElementContent'
import { LifeCycle, LifeCycleEventType, Subscription } from './lifeCycle'
import { UserActionType } from './rum'

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

export function startUserActionCollection(lifeCycle: LifeCycle) {
  function processClick(event: Event) {
    if (!(event.target instanceof Element)) {
      return
    }

    const content = getElementContent(event.target)

    const { observable: pageActivitiesObservable, stop: stopPageActivitiesTracking } = trackPageActivities(lifeCycle)

    newUserAction(pageActivitiesObservable, (userActionCompleteEvent) => {
      stopPageActivitiesTracking()
      if (userActionCompleteEvent) {
        lifeCycle.notify(LifeCycleEventType.USER_ACTION_COLLECTED, {
          duration: userActionCompleteEvent.duration,
          id: userActionCompleteEvent.id,
          name: content,
          startTime: userActionCompleteEvent.startTime,
          type: UserActionType.CLICK,
        })
      }
    })
  }

  addEventListener(DOM_EVENT.CLICK, processClick, { capture: true })

  return {
    stop() {
      removeEventListener(DOM_EVENT.CLICK, processClick, { capture: true })
    },
  }
}

let currentUserAction: { id: string; startTime: number } | undefined

export interface UserActionReference {
  id: string
}
export function getUserActionReference(time?: number): UserActionReference | undefined {
  if (!currentUserAction) {
    return undefined
  }

  if (time !== undefined && time < currentUserAction.startTime) {
    return undefined
  }

  return { id: currentUserAction.id }
}

interface UserActionCompleteEvent {
  id: string
  startTime: number
  duration: number
}

function newUserAction(
  pageActivitiesObservable: Observable<PageActivityEvent>,
  finishCallback: (userActionCompleteEvent: UserActionCompleteEvent | undefined) => void
) {
  if (currentUserAction) {
    // Discard any new user action if another one is already occuring.
    finishCallback(undefined)
    return
  }

  let idleTimeoutId: ReturnType<typeof setTimeout>
  const id = generateUUID()
  const startTime = performance.now()
  let hasFinished = false

  const validationTimeoutId = setTimeout(monitor(() => finish(undefined)), USER_ACTION_VALIDATION_DELAY)
  const maxDurationTimeoutId = setTimeout(
    monitor(() => finish(completeUserAction(performance.now()))),
    USER_ACTION_MAX_DURATION
  )

  currentUserAction = { id, startTime }

  pageActivitiesObservable.subscribe(({ isBusy }) => {
    clearTimeout(validationTimeoutId)
    clearTimeout(idleTimeoutId)
    const lastChangeTime = performance.now()
    if (!isBusy) {
      idleTimeoutId = setTimeout(monitor(() => finish(completeUserAction(lastChangeTime))), USER_ACTION_END_DELAY)
    }
  })

  function completeUserAction(endTime: number): UserActionCompleteEvent {
    return { id, startTime, duration: endTime - startTime }
  }

  function finish(userActionCompleteEvent: UserActionCompleteEvent | undefined) {
    if (hasFinished) {
      return
    }
    hasFinished = true
    clearTimeout(validationTimeoutId)
    clearTimeout(idleTimeoutId)
    clearTimeout(maxDurationTimeoutId)
    currentUserAction = undefined
    finishCallback(userActionCompleteEvent)
  }
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

export const $$tests = {
  newUserAction,
  trackPageActivities,
  resetUserAction() {
    currentUserAction = undefined
  },
}

import { monitor, Observable } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType, Subscription } from './lifeCycle'

// Delay to wait for a page activity to validate the tracking process
export const PAGE_ACTIVITY_VALIDATION_DELAY = 100
// Delay to wait after a page activity to end the tracking process
export const PAGE_ACTIVITY_END_DELAY = 100
// Maximum duration of the tracking process
export const PAGE_ACTIVITY_MAX_DURATION = 10_000

export interface PageActivityEvent {
  isBusy: boolean
}

export function waitIdlePageActivity(
  lifeCycle: LifeCycle,
  completionCallback: (hadActivity: boolean, endTime: number) => void
): { stop(): void } {
  const { observable: pageActivitiesObservable, stop: stopPageActivitiesTracking } = trackPageActivities(lifeCycle)

  const { stop: stopWaitPageActivitiesCompletion } = waitPageActivitiesCompletion(
    pageActivitiesObservable,
    stopPageActivitiesTracking,
    completionCallback
  )

  function stop() {
    stopWaitPageActivitiesCompletion()
    stopPageActivitiesTracking()
  }

  return { stop }
}

// Automatic user action collection lifecycle overview:
//                      (Start new trackPageActivities)
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
// Note: because MAX_DURATION > VALIDATION_DELAY, we are sure that if the process is still alive
// after MAX_DURATION, it has been validated.
export function trackPageActivities(lifeCycle: LifeCycle): { observable: Observable<PageActivityEvent>; stop(): void } {
  const observable = new Observable<PageActivityEvent>()
  const subscriptions: Subscription[] = []
  let firstRequestIndex: undefined | number
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
      if (firstRequestIndex === undefined) {
        firstRequestIndex = startEvent.requestIndex
      }

      pendingRequestsCount += 1
      notifyPageActivity()
    })
  )

  subscriptions.push(
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, (request) => {
      // If the request started before the tracking start, ignore it
      if (firstRequestIndex === undefined || request.requestIndex < firstRequestIndex) {
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

export function waitPageActivitiesCompletion(
  pageActivitiesObservable: Observable<PageActivityEvent>,
  stopPageActivitiesTracking: () => void,
  completionCallback: (hadActivity: boolean, endTime: number) => void
): { stop(): void } {
  let idleTimeoutId: ReturnType<typeof setTimeout>
  let hasCompleted = false

  const validationTimeoutId = setTimeout(monitor(() => complete(false, 0)), PAGE_ACTIVITY_VALIDATION_DELAY)
  const maxDurationTimeoutId = setTimeout(monitor(() => complete(true, performance.now())), PAGE_ACTIVITY_MAX_DURATION)

  pageActivitiesObservable.subscribe(({ isBusy }) => {
    clearTimeout(validationTimeoutId)
    clearTimeout(idleTimeoutId)
    const lastChangeTime = performance.now()
    if (!isBusy) {
      idleTimeoutId = setTimeout(monitor(() => complete(true, lastChangeTime)), PAGE_ACTIVITY_END_DELAY)
    }
  })

  function stop() {
    hasCompleted = true
    clearTimeout(validationTimeoutId)
    clearTimeout(idleTimeoutId)
    clearTimeout(maxDurationTimeoutId)
    stopPageActivitiesTracking()
  }

  function complete(hadActivity: boolean, endTime: number) {
    if (hasCompleted) {
      return
    }
    stop()
    completionCallback(hadActivity, endTime)
  }

  return { stop }
}

import { monitor, Observable, Subscription, TimeStamp, timeStampNow } from '@datadog/browser-core'
import { DOMMutationObservable } from '../browser/domMutationObservable'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'

// Delay to wait for a page activity to validate the tracking process
export const PAGE_ACTIVITY_VALIDATION_DELAY = 100
// Delay to wait after a page activity to end the tracking process
export const PAGE_ACTIVITY_END_DELAY = 100
// Maximum duration of the tracking process
export const PAGE_ACTIVITY_MAX_DURATION = 10_000

export interface PageActivityEvent {
  isBusy: boolean
}

type CompletionCallbackParameters = { hadActivity: true; endTime: TimeStamp } | { hadActivity: false }

export function waitIdlePageActivity(
  lifeCycle: LifeCycle,
  domMutationObservable: DOMMutationObservable,
  completionCallback: (params: CompletionCallbackParameters) => void
) {
  const { observable: pageActivitiesObservable, stop: stopPageActivitiesTracking } = trackPageActivities(
    lifeCycle,
    domMutationObservable
  )

  const { stop: stopWaitPageActivitiesCompletion } = waitPageActivitiesCompletion(
    pageActivitiesObservable,
    stopPageActivitiesTracking,
    completionCallback
  )

  const stop = () => {
    stopWaitPageActivitiesCompletion()
    stopPageActivitiesTracking()
  }

  return { stop }
}

// Automatic action collection lifecycle overview:
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
export function trackPageActivities(
  lifeCycle: LifeCycle,
  domMutationObservable: DOMMutationObservable
): { observable: Observable<PageActivityEvent>; stop: () => void } {
  const observable = new Observable<PageActivityEvent>()
  const subscriptions: Subscription[] = []
  let firstRequestIndex: undefined | number
  let pendingRequestsCount = 0

  subscriptions.push(domMutationObservable.subscribe(() => notifyPageActivity()))

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
    stop: () => {
      subscriptions.forEach((s) => s.unsubscribe())
    },
  }
}

export function waitPageActivitiesCompletion(
  pageActivitiesObservable: Observable<PageActivityEvent>,
  stopPageActivitiesTracking: () => void,
  completionCallback: (params: CompletionCallbackParameters) => void
): { stop: () => void } {
  let idleTimeoutId: number
  let hasCompleted = false

  const validationTimeoutId = setTimeout(
    monitor(() => complete({ hadActivity: false })),
    PAGE_ACTIVITY_VALIDATION_DELAY
  )
  const maxDurationTimeoutId = setTimeout(
    monitor(() => complete({ hadActivity: true, endTime: timeStampNow() })),
    PAGE_ACTIVITY_MAX_DURATION
  )

  pageActivitiesObservable.subscribe(({ isBusy }) => {
    clearTimeout(validationTimeoutId)
    clearTimeout(idleTimeoutId)
    const lastChangeTime = timeStampNow()
    if (!isBusy) {
      idleTimeoutId = setTimeout(
        monitor(() => complete({ hadActivity: true, endTime: lastChangeTime })),
        PAGE_ACTIVITY_END_DELAY
      )
    }
  })

  const stop = () => {
    hasCompleted = true
    clearTimeout(validationTimeoutId)
    clearTimeout(idleTimeoutId)
    clearTimeout(maxDurationTimeoutId)
    stopPageActivitiesTracking()
  }

  function complete(params: CompletionCallbackParameters) {
    if (hasCompleted) {
      return
    }
    stop()
    completionCallback(params)
  }

  return { stop }
}

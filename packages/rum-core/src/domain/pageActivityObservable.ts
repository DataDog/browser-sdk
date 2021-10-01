import { monitor, Observable, Subscription, TimeStamp, timeStampNow } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'

// Delay to wait for a page activity to validate the tracking process
export const PAGE_ACTIVITY_VALIDATION_DELAY = 100
// Delay to wait after a page activity to end the tracking process
export const PAGE_ACTIVITY_END_DELAY = 100

export interface PageActivityEvent {
  isBusy: boolean
}

export type PageActivityCompletionEvent = { hadActivity: true; endTime: TimeStamp } | { hadActivity: false }

export function createIdlePageActivityObservable(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  maxDuration?: number
) {
  const pageActivityObservable = createPageActivityObservable(lifeCycle, domMutationObservable)
  const observable = new Observable<PageActivityCompletionEvent>(() => {
    const { stop } = waitPageActivitiesCompletion(pageActivityObservable, (e) => observable.notify(e), maxDuration)
    return () => stop()
  })

  return observable
}

// Automatic action collection lifecycle overview:
//                      (Start new trackPageActivities)
//              .-------------------'--------------------.
//              v                                        v
//     [Wait for a page activity ]          [Wait for a maximum duration]
//     [timeout: VALIDATION_DELAY]          [  timeout: maxDuration     ]
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
// Note: by assuming that maxDuration is greater than VALIDATION_DELAY, we are sure that if the
// process is still alive after maxDuration, it has been validated.

export function createPageActivityObservable(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>
): Observable<PageActivityEvent> {
  const observable = new Observable<PageActivityEvent>(() => {
    const subscriptions: Subscription[] = []
    let firstRequestIndex: undefined | number
    let pendingRequestsCount = 0

    subscriptions.push(
      domMutationObservable.subscribe(() => notifyPageActivity(pendingRequestsCount)),
      lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
        if (entry.entryType !== 'resource') {
          return
        }

        notifyPageActivity(pendingRequestsCount)
      }),
      lifeCycle.subscribe(LifeCycleEventType.REQUEST_STARTED, (startEvent) => {
        if (firstRequestIndex === undefined) {
          firstRequestIndex = startEvent.requestIndex
        }

        notifyPageActivity(++pendingRequestsCount)
      }),
      lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, (request) => {
        // If the request started before the tracking start, ignore it
        if (firstRequestIndex === undefined || request.requestIndex < firstRequestIndex) {
          return
        }
        notifyPageActivity(--pendingRequestsCount)
      })
    )

    return () => subscriptions.forEach((s) => s.unsubscribe())
  })

  function notifyPageActivity(pendingRequestsCount: number) {
    observable.notify({ isBusy: pendingRequestsCount > 0 })
  }

  return observable
}

export function waitPageActivitiesCompletion(
  pageActivityObservable: Observable<PageActivityEvent>,
  completionCallback: (params: PageActivityCompletionEvent) => void,
  maxDuration?: number
): { stop: () => void } {
  let idleTimeoutId: number
  let hasCompleted = false

  const validationTimeoutId = setTimeout(
    monitor(() => complete({ hadActivity: false })),
    PAGE_ACTIVITY_VALIDATION_DELAY
  )
  const maxDurationTimeoutId =
    maxDuration &&
    setTimeout(
      monitor(() => complete({ hadActivity: true, endTime: timeStampNow() })),
      maxDuration
    )

  const pageActivitySubscription = pageActivityObservable.subscribe(({ isBusy }) => {
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
    pageActivitySubscription.unsubscribe()
  }

  function complete(params: PageActivityCompletionEvent) {
    if (hasCompleted) {
      return
    }
    stop()
    completionCallback(params)
  }

  return { stop }
}

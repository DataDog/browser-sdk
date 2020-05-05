import { monitor, Observable } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType, Subscription } from './lifeCycle'

// Delay to wait for a page activity to validate the user action
export const USER_ACTION_VALIDATION_DELAY = 100
// Delay to wait after a page activity to end the user action
export const USER_ACTION_END_DELAY = 100
// Maximum duration of a user action
export const USER_ACTION_MAX_DURATION = 10_000

export interface PageActivityEvent {
  isBusy: boolean
}

export function waitIdlePageActivity(
  lifeCycle: LifeCycle,
  completionCallback: (endTime: number | undefined) => void
): () => void {
  const { observable: pageActivitiesObservable, stop: stopPageActivitiesTracking } = trackPageActivities(lifeCycle)

  waitPageActivitiesCompletion(pageActivitiesObservable, stopPageActivitiesTracking, (endTime) => {
    completionCallback(endTime)
  })

  return stopPageActivitiesTracking
}

export function trackPageActivities(lifeCycle: LifeCycle): { observable: Observable<PageActivityEvent>; stop(): void } {
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

export function waitPageActivitiesCompletion(
  pageActivitiesObservable: Observable<PageActivityEvent>,
  stopPageActivitiesTracking: () => void,
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
    stopPageActivitiesTracking()
    completionCallback(endTime)
  }
}

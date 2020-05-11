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
  completionCallback: (endTime: number | undefined) => void
): { stop(): void } {
  const { observable: pageActivitiesObservable, stop: stopPageActivitiesTracking } = trackPageActivities(lifeCycle)

  const { stop: stopWaitPageActivitiesCompletion } = waitPageActivitiesCompletion(
    pageActivitiesObservable,
    stopPageActivitiesTracking,
    (endTime) => {
      completionCallback(endTime)
    }
  )

  function stop() {
    stopWaitPageActivitiesCompletion()
    stopPageActivitiesTracking()
  }

  return { stop }
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
): { stop(): void } {
  let idleTimeoutId: ReturnType<typeof setTimeout>
  let hasCompleted = false

  const validationTimeoutId = setTimeout(monitor(() => complete(undefined)), PAGE_ACTIVITY_VALIDATION_DELAY)
  const maxDurationTimeoutId = setTimeout(monitor(() => complete(performance.now())), PAGE_ACTIVITY_MAX_DURATION)

  pageActivitiesObservable.subscribe(({ isBusy }) => {
    clearTimeout(validationTimeoutId)
    clearTimeout(idleTimeoutId)
    const lastChangeTime = performance.now()
    if (!isBusy) {
      idleTimeoutId = setTimeout(monitor(() => complete(lastChangeTime)), PAGE_ACTIVITY_END_DELAY)
    }
  })

  function stop() {
    hasCompleted = true
    clearTimeout(validationTimeoutId)
    clearTimeout(idleTimeoutId)
    clearTimeout(maxDurationTimeoutId)
    stopPageActivitiesTracking()
  }

  function complete(endTime: number | undefined) {
    if (hasCompleted) {
      return
    }
    stop()
    completionCallback(endTime)
  }

  return { stop }
}

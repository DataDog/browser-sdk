import type { Subscription, TimeoutId, TimeStamp } from '@datadog/browser-core'
import { instrumentMethodAndCallOriginal, matchList, monitor, Observable, timeStampNow } from '@datadog/browser-core'
import type { RumConfiguration } from './configuration'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'

// Delay to wait for a page activity to validate the tracking process
export const PAGE_ACTIVITY_VALIDATION_DELAY = 100
// Delay to wait after a page activity to end the tracking process
export const PAGE_ACTIVITY_END_DELAY = 100

export interface PageActivityEvent {
  isBusy: boolean
}

export type PageActivityEndEvent = { hadActivity: true; end: TimeStamp } | { hadActivity: false }

/**
 * Wait for the page activity end
 *
 * Detection lifecycle:
 * ```
 *                        Wait page activity end
 *              .-------------------'--------------------.
 *              v                                        v
 *     [Wait for a page activity ]          [Wait for a maximum duration]
 *     [timeout: VALIDATION_DELAY]          [  timeout: maxDuration     ]
 *          /                  \                           |
 *         v                    v                          |
 *  [No page activity]   [Page activity]                   |
 *         |                   |,----------------------.   |
 *         v                   v                       |   |
 *     (Discard)     [Wait for a page activity]        |   |
 *                   [   timeout: END_DELAY   ]        |   |
 *                       /                \            |   |
 *                      v                  v           |   |
 *             [No page activity]    [Page activity]   |   |
 *                      |                 |            |   |
 *                      |                 '------------'   |
 *                      '-----------. ,--------------------'
 *                                   v
 *                                 (End)
 * ```
 *
 * Note: by assuming that maxDuration is greater than VALIDATION_DELAY, we are sure that if the
 * process is still alive after maxDuration, it has been validated.
 */
export function waitPageActivityEnd(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  configuration: RumConfiguration,
  pageActivityEndCallback: (event: PageActivityEndEvent) => void,
  maxDuration?: number
) {
  const pageActivityObservable = createPageActivityObservable(lifeCycle, domMutationObservable, configuration)
  return doWaitPageActivityEnd(pageActivityObservable, pageActivityEndCallback, maxDuration)
}

export function doWaitPageActivityEnd(
  pageActivityObservable: Observable<PageActivityEvent>,
  pageActivityEndCallback: (event: PageActivityEndEvent) => void,
  maxDuration?: number
) {
  let pageActivityEndTimeoutId: TimeoutId
  let hasCompleted = false

  const validationTimeoutId = setTimeout(
    monitor(() => complete({ hadActivity: false })),
    PAGE_ACTIVITY_VALIDATION_DELAY
  )
  const maxDurationTimeoutId =
    maxDuration &&
    setTimeout(
      monitor(() => complete({ hadActivity: true, end: timeStampNow() })),
      maxDuration
    )

  const pageActivitySubscription = pageActivityObservable.subscribe(({ isBusy }) => {
    clearTimeout(validationTimeoutId)
    clearTimeout(pageActivityEndTimeoutId)
    const lastChangeTime = timeStampNow()
    if (!isBusy) {
      pageActivityEndTimeoutId = setTimeout(
        monitor(() => complete({ hadActivity: true, end: lastChangeTime })),
        PAGE_ACTIVITY_END_DELAY
      )
    }
  })

  const stop = () => {
    hasCompleted = true
    clearTimeout(validationTimeoutId)
    clearTimeout(pageActivityEndTimeoutId)
    clearTimeout(maxDurationTimeoutId)
    pageActivitySubscription.unsubscribe()
  }

  function complete(event: PageActivityEndEvent) {
    if (hasCompleted) {
      return
    }
    stop()
    pageActivityEndCallback(event)
  }
  return { stop }
}

export function createPageActivityObservable(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  configuration: RumConfiguration
): Observable<PageActivityEvent> {
  const observable = new Observable<PageActivityEvent>(() => {
    const subscriptions: Subscription[] = []
    let firstRequestIndex: undefined | number
    let pendingRequestsCount = 0

    subscriptions.push(
      domMutationObservable.subscribe(notifyPageActivity),
      lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
        if (entries.some((entry) => entry.entryType === 'resource' && !isExcludedUrl(configuration, entry.name))) {
          notifyPageActivity()
        }
      }),
      lifeCycle.subscribe(LifeCycleEventType.REQUEST_STARTED, (startEvent) => {
        if (isExcludedUrl(configuration, startEvent.url)) {
          return
        }
        if (firstRequestIndex === undefined) {
          firstRequestIndex = startEvent.requestIndex
        }
        pendingRequestsCount += 1
        notifyPageActivity()
      }),
      lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, (request) => {
        if (
          isExcludedUrl(configuration, request.url) ||
          firstRequestIndex === undefined ||
          // If the request started before the tracking start, ignore it
          request.requestIndex < firstRequestIndex
        ) {
          return
        }
        pendingRequestsCount -= 1
        notifyPageActivity()
      })
    )

    const { stop: stopTrackingWindowOpen } = trackWindowOpen(notifyPageActivity)

    return () => {
      stopTrackingWindowOpen()
      subscriptions.forEach((s) => s.unsubscribe())
    }

    function notifyPageActivity() {
      observable.notify({ isBusy: pendingRequestsCount > 0 })
    }
  })

  return observable
}

function isExcludedUrl(configuration: RumConfiguration, requestUrl: string): boolean {
  return matchList(configuration.excludedActivityUrls, requestUrl)
}

function trackWindowOpen(callback: () => void) {
  return instrumentMethodAndCallOriginal(window, 'open', { before: callback })
}

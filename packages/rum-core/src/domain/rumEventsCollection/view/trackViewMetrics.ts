import { Duration, noop, elapsed, round, timeStampNow } from '@datadog/browser-core'
import { supportPerformanceTimingEvent } from '../../../browser/performanceCollection'
import { ViewLoadingType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { EventCounts, trackEventCounts } from '../../trackEventCounts'
import { waitIdlePageActivity } from '../../trackPageActivities'
import { DOMMutationObservable } from '../../../browser/domMutationObservable'

export interface ViewMetrics {
  eventCounts: EventCounts
  loadingTime?: Duration
  cumulativeLayoutShift?: number
}

export function trackViewMetrics(
  lifeCycle: LifeCycle,
  domMutationObservable: DOMMutationObservable,
  scheduleViewUpdate: () => void,
  loadingType: ViewLoadingType
) {
  const viewMetrics: ViewMetrics = {
    eventCounts: {
      errorCount: 0,
      longTaskCount: 0,
      resourceCount: 0,
      userActionCount: 0,
    },
  }
  const { stop: stopEventCountsTracking } = trackEventCounts(lifeCycle, (newEventCounts) => {
    viewMetrics.eventCounts = newEventCounts
    scheduleViewUpdate()
  })

  const { setActivityLoadingTime, setLoadEvent } = trackLoadingTime(loadingType, (newLoadingTime) => {
    viewMetrics.loadingTime = newLoadingTime
    scheduleViewUpdate()
  })

  const { stop: stopActivityLoadingTimeTracking } = trackActivityLoadingTime(
    lifeCycle,
    domMutationObservable,
    setActivityLoadingTime
  )

  let stopCLSTracking: () => void
  if (isLayoutShiftSupported()) {
    viewMetrics.cumulativeLayoutShift = 0
    ;({ stop: stopCLSTracking } = trackLayoutShift(lifeCycle, (layoutShift) => {
      viewMetrics.cumulativeLayoutShift = round(viewMetrics.cumulativeLayoutShift! + layoutShift, 4)
      scheduleViewUpdate()
    }))
  } else {
    stopCLSTracking = noop
  }
  return {
    stop: () => {
      stopEventCountsTracking()
      stopActivityLoadingTimeTracking()
      stopCLSTracking()
    },
    setLoadEvent,
    viewMetrics,
  }
}

function trackLoadingTime(loadType: ViewLoadingType, callback: (loadingTime: Duration) => void) {
  let isWaitingForLoadEvent = loadType === ViewLoadingType.INITIAL_LOAD
  let isWaitingForActivityLoadingTime = true
  const loadingTimeCandidates: Duration[] = []

  function invokeCallbackIfAllCandidatesAreReceived() {
    if (!isWaitingForActivityLoadingTime && !isWaitingForLoadEvent && loadingTimeCandidates.length > 0) {
      callback(Math.max(...loadingTimeCandidates) as Duration)
    }
  }

  return {
    setLoadEvent: (loadEvent: Duration) => {
      if (isWaitingForLoadEvent) {
        isWaitingForLoadEvent = false
        loadingTimeCandidates.push(loadEvent)
        invokeCallbackIfAllCandidatesAreReceived()
      }
    },
    setActivityLoadingTime: (activityLoadingTime: Duration | undefined) => {
      if (isWaitingForActivityLoadingTime) {
        isWaitingForActivityLoadingTime = false
        if (activityLoadingTime !== undefined) {
          loadingTimeCandidates.push(activityLoadingTime)
        }
        invokeCallbackIfAllCandidatesAreReceived()
      }
    },
  }
}

function trackActivityLoadingTime(
  lifeCycle: LifeCycle,
  domMutationObservable: DOMMutationObservable,
  callback: (loadingTimeValue: Duration | undefined) => void
) {
  const startTime = timeStampNow()
  const { stop: stopWaitIdlePageActivity } = waitIdlePageActivity(lifeCycle, domMutationObservable, (params) => {
    if (params.hadActivity) {
      callback(elapsed(startTime, params.endTime))
    } else {
      callback(undefined)
    }
  })

  return { stop: stopWaitIdlePageActivity }
}

/**
 * Track layout shifts (LS) occurring during the Views.  This yields multiple values that can be
 * added up to compute the cumulated layout shift (CLS).
 *
 * See isLayoutShiftSupported to check for browser support.
 *
 * Documentation: https://web.dev/cls/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/master/src/getCLS.ts
 */
function trackLayoutShift(lifeCycle: LifeCycle, callback: (layoutShift: number) => void) {
  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (entry.entryType === 'layout-shift' && !entry.hadRecentInput) {
      callback(entry.value)
    }
  })

  return {
    stop,
  }
}

/**
 * Check whether `layout-shift` is supported by the browser.
 */
function isLayoutShiftSupported() {
  return supportPerformanceTimingEvent('layout-shift')
}

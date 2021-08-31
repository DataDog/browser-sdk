import {
  Duration,
  noop,
  elapsed,
  round,
  timeStampNow,
  Configuration,
  RelativeTime,
  ONE_SECOND,
} from '@datadog/browser-core'
import { RumLayoutShiftTiming, supportPerformanceTimingEvent } from '../../../browser/performanceCollection'
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
  loadingType: ViewLoadingType,
  configuration: Configuration
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
    configuration,
    setActivityLoadingTime
  )

  let stopCLSTracking: () => void
  if (isLayoutShiftSupported()) {
    viewMetrics.cumulativeLayoutShift = 0
    ;({ stop: stopCLSTracking } = trackCumulativeLayoutShift(lifeCycle, (layoutShift) => {
      viewMetrics.cumulativeLayoutShift = Math.max(viewMetrics.cumulativeLayoutShift!, round(layoutShift, 4))
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
  configuration: Configuration,
  callback: (loadingTimeValue: Duration | undefined) => void
) {
  const startTime = timeStampNow()
  const { stop: stopWaitIdlePageActivity } = waitIdlePageActivity(
    lifeCycle,
    domMutationObservable,
    configuration,
    (params) => {
      if (params.hadActivity) {
        callback(elapsed(startTime, params.endTime))
      } else {
        callback(undefined)
      }
    }
  )

  return { stop: stopWaitIdlePageActivity }
}

/**
 * Track the cumulative layout shifts (CLS).
 * Layout shifts are grouped into session windows.
 * The minimum gap between session windows is 1 second.
 * The maximum duration of a session window is 5 second.
 * The session window layout shift value is the sum of layout shifts inside it.
 * The CLS value is the max of session windows values.
 *
 * This yields a new value whenever the CLS value is updated (a higher session window value is computed).
 *
 * See isLayoutShiftSupported to check for browser support.
 *
 * Documentation:
 * https://web.dev/cls/
 * https://web.dev/evolving-cls/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/master/src/getCLS.ts
 */
function trackCumulativeLayoutShift(lifeCycle: LifeCycle, callback: (layoutShift: number) => void) {
  let clsValue = 0
  let windowValue = 0
  let windowStartedAt = 0 as RelativeTime
  let windowLastEntryAt = 0 as RelativeTime

  const updateSessionWindow = (entry: RumLayoutShiftTiming) => {
    const durationSinceStart = entry.startTime - windowStartedAt
    const durationSinceLastEntry = entry.startTime - windowLastEntryAt
    if (durationSinceLastEntry < 1 * ONE_SECOND && durationSinceStart < 5 * ONE_SECOND) {
      windowValue += entry.value
    } else {
      windowValue = entry.value
      windowStartedAt = entry.startTime
    }
    windowLastEntryAt = entry.startTime
  }

  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (entry.entryType === 'layout-shift' && !entry.hadRecentInput) {
      updateSessionWindow(entry)
      if (windowValue > clsValue) {
        clsValue = windowValue
        callback(clsValue)
      }
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

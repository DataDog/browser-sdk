import { Duration, noop, round, RelativeTime, ONE_SECOND, Observable } from '@datadog/browser-core'
import { RumLayoutShiftTiming, supportPerformanceTimingEvent } from '../../../browser/performanceCollection'
import { ViewLoadingType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { EventCounts, trackEventCounts } from '../../trackEventCounts'
import { waitIdlePage } from '../../waitIdlePage'

export interface ViewMetrics {
  eventCounts: EventCounts
  loadingTime?: Duration
  cumulativeLayoutShift?: number
}

export function trackViewMetrics(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
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
    ;({ stop: stopCLSTracking } = trackCumulativeLayoutShift(lifeCycle, (cumulativeLayoutShift) => {
      viewMetrics.cumulativeLayoutShift = cumulativeLayoutShift
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
  domMutationObservable: Observable<void>,
  callback: (loadingTimeValue: Duration | undefined) => void
) {
  return waitIdlePage(lifeCycle, domMutationObservable, (event) => {
    if (event.hadActivity) {
      callback(event.duration)
    } else {
      callback(undefined)
    }
  })
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
  let maxClsValue = 0
  const window = slidingSessionWindow()
  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (entry.entryType === 'layout-shift' && !entry.hadRecentInput) {
      window.update(entry)
      if (window.value() > maxClsValue) {
        maxClsValue = window.value()
        callback(round(maxClsValue, 4))
      }
    }
  })

  return {
    stop,
  }
}

function slidingSessionWindow() {
  let value = 0
  let startTime: RelativeTime
  let endTime: RelativeTime
  return {
    update: (entry: RumLayoutShiftTiming) => {
      const shouldCreateNewWindow =
        startTime === undefined ||
        entry.startTime - endTime >= ONE_SECOND ||
        entry.startTime - startTime >= 5 * ONE_SECOND
      if (shouldCreateNewWindow) {
        startTime = endTime = entry.startTime
        value = entry.value
      } else {
        value += entry.value
        endTime = entry.startTime
      }
    },
    value: () => value,
  }
}

/**
 * Check whether `layout-shift` is supported by the browser.
 */
function isLayoutShiftSupported() {
  return supportPerformanceTimingEvent('layout-shift')
}

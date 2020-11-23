import { addEventListener, DOM_EVENT, generateUUID, monitor, noop, ONE_MINUTE, throttle } from '@datadog/browser-core'

import { supportPerformanceTimingEvent } from '../../../browser/performanceCollection'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { EventCounts, trackEventCounts } from '../../trackEventCounts'
import { waitIdlePageActivity } from '../../trackPageActivities'
import { Timings, trackTimings } from './trackTimings'

export interface View {
  id: string
  location: Location
  referrer: string
  timings: Timings
  eventCounts: EventCounts
  documentVersion: number
  startTime: number
  duration: number
  loadingTime?: number | undefined
  loadingType: ViewLoadingType
  cumulativeLayoutShift?: number
}

export interface ViewCreatedEvent {
  id: string
  location: Location
  referrer: string
  startTime: number
}

export enum ViewLoadingType {
  INITIAL_LOAD = 'initial_load',
  ROUTE_CHANGE = 'route_change',
}

export const THROTTLE_VIEW_UPDATE_PERIOD = 3000
export const SESSION_KEEP_ALIVE_INTERVAL = 5 * ONE_MINUTE

export function trackViews(location: Location, lifeCycle: LifeCycle) {
  const startOrigin = 0
  const initialView = newView(lifeCycle, location, ViewLoadingType.INITIAL_LOAD, document.referrer, startOrigin)
  let currentView = initialView

  const { stop: stopTimingsTracking } = trackTimings(lifeCycle, (timings) => {
    initialView.updateTimings(timings)
    initialView.scheduleUpdate()
  })

  trackHistory(onLocationChange)
  trackHash(onLocationChange)

  function onLocationChange() {
    if (currentView.isDifferentView(location)) {
      // Renew view on location changes
      currentView.triggerUpdate()
      currentView.end()
      currentView = newView(lifeCycle, location, ViewLoadingType.ROUTE_CHANGE, currentView.url)
    } else {
      currentView.updateLocation(location)
      currentView.triggerUpdate()
    }
  }

  // Renew view on session renewal
  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    // do not trigger view update to avoid wrong data
    currentView.end()
    currentView = newView(lifeCycle, location, ViewLoadingType.ROUTE_CHANGE, currentView.url)
  })

  // End the current view on page unload
  lifeCycle.subscribe(LifeCycleEventType.BEFORE_UNLOAD, () => {
    currentView.triggerUpdate()
    currentView.end()
  })

  // Session keep alive
  const keepAliveInterval = window.setInterval(
    monitor(() => {
      currentView.triggerUpdate()
    }),
    SESSION_KEEP_ALIVE_INTERVAL
  )

  return {
    stop() {
      stopTimingsTracking()
      currentView.end()
      clearInterval(keepAliveInterval)
    },
  }
}

function newView(
  lifeCycle: LifeCycle,
  initialLocation: Location,
  loadingType: ViewLoadingType,
  referrer: string,
  startTime: number = performance.now()
) {
  // Setup initial values
  const id = generateUUID()
  let eventCounts: EventCounts = {
    errorCount: 0,
    longTaskCount: 0,
    resourceCount: 0,
    userActionCount: 0,
  }
  let timings: Timings = {}
  let documentVersion = 0
  let cumulativeLayoutShift: number | undefined
  let loadingTime: number | undefined
  let endTime: number | undefined
  let location: Location = { ...initialLocation }

  lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { id, startTime, location, referrer })

  // Update the view every time the measures are changing
  const { throttled: scheduleViewUpdate, cancel: cancelScheduleViewUpdate } = throttle(
    monitor(triggerViewUpdate),
    THROTTLE_VIEW_UPDATE_PERIOD,
    {
      leading: false,
    }
  )

  const { stop: stopEventCountsTracking } = trackEventCounts(lifeCycle, (newEventCounts) => {
    eventCounts = newEventCounts
    scheduleViewUpdate()
  })

  const { setActivityLoadingTime, setLoadEventEnd } = trackLoadingTime(loadingType, (newLoadingTime) => {
    loadingTime = newLoadingTime
    scheduleViewUpdate()
  })

  const { stop: stopActivityLoadingTimeTracking } = trackActivityLoadingTime(lifeCycle, setActivityLoadingTime)

  let stopCLSTracking: () => void
  if (isLayoutShiftSupported()) {
    cumulativeLayoutShift = 0
    ;({ stop: stopCLSTracking } = trackLayoutShift(lifeCycle, (layoutShift) => {
      cumulativeLayoutShift! += layoutShift
      scheduleViewUpdate()
    }))
  } else {
    stopCLSTracking = noop
  }

  // Initial view update
  triggerViewUpdate()

  function triggerViewUpdate() {
    documentVersion += 1
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
      cumulativeLayoutShift,
      documentVersion,
      eventCounts,
      id,
      loadingTime,
      loadingType,
      location,
      referrer,
      startTime,
      timings,
      duration: (endTime === undefined ? performance.now() : endTime) - startTime,
    })
  }

  return {
    scheduleUpdate: scheduleViewUpdate,
    end() {
      endTime = performance.now()
      stopEventCountsTracking()
      stopActivityLoadingTimeTracking()
      stopCLSTracking()
    },
    isDifferentView(otherLocation: Location) {
      return (
        location.pathname !== otherLocation.pathname ||
        (!isHashAnAnchor(otherLocation.hash) && otherLocation.hash !== location.hash)
      )
    },
    triggerUpdate() {
      // cancel any pending view updates execution
      cancelScheduleViewUpdate()
      triggerViewUpdate()
    },
    updateTimings(newTimings: Timings) {
      timings = newTimings
      if (newTimings.loadEventEnd !== undefined) {
        setLoadEventEnd(newTimings.loadEventEnd)
      }
    },
    updateLocation(newLocation: Location) {
      location = { ...newLocation }
    },
    get url() {
      return location.href
    },
  }
}

function isHashAnAnchor(hash: string) {
  const correspondingId = hash.substr(1)
  return !!document.getElementById(correspondingId)
}

function trackHistory(onHistoryChange: () => void) {
  const originalPushState = history.pushState
  history.pushState = monitor(function(this: History['pushState']) {
    originalPushState.apply(this, arguments as any)
    onHistoryChange()
  })
  const originalReplaceState = history.replaceState
  history.replaceState = monitor(function(this: History['replaceState']) {
    originalReplaceState.apply(this, arguments as any)
    onHistoryChange()
  })
  addEventListener(window, DOM_EVENT.POP_STATE, onHistoryChange)
}

function trackHash(onHashChange: () => void) {
  addEventListener(window, DOM_EVENT.HASH_CHANGE, onHashChange)
}

function trackLoadingTime(loadType: ViewLoadingType, callback: (loadingTime: number) => void) {
  let isWaitingForLoadEventEnd = loadType === ViewLoadingType.INITIAL_LOAD
  let isWaitingForActivityLoadingTime = true
  const loadingTimeCandidates: number[] = []

  function invokeCallbackIfAllCandidatesAreReceived() {
    if (!isWaitingForActivityLoadingTime && !isWaitingForLoadEventEnd && loadingTimeCandidates.length > 0) {
      callback(Math.max(...loadingTimeCandidates))
    }
  }

  return {
    setLoadEventEnd(loadEventEnd: number) {
      if (isWaitingForLoadEventEnd) {
        isWaitingForLoadEventEnd = false
        loadingTimeCandidates.push(loadEventEnd)
        invokeCallbackIfAllCandidatesAreReceived()
      }
    },
    setActivityLoadingTime(activityLoadingTime: number | undefined) {
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

function trackActivityLoadingTime(lifeCycle: LifeCycle, callback: (loadingTimeValue: number | undefined) => void) {
  const startTime = performance.now()
  const { stop: stopWaitIdlePageActivity } = waitIdlePageActivity(lifeCycle, (hadActivity, endTime) => {
    if (hadActivity) {
      callback(endTime - startTime)
    } else {
      callback(undefined)
    }
  })

  return { stop: stopWaitIdlePageActivity }
}

/**
 * Track layout shifts (LS) occuring during the Views.  This yields multiple values that can be
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

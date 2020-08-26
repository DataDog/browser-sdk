import { DOM_EVENT, generateUUID, monitor, ONE_MINUTE, throttle } from '@datadog/browser-core'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { EventCounts, trackEventCounts } from './trackEventCounts'
import { waitIdlePageActivity } from './trackPageActivities'

export interface View {
  id: string
  location: Location
  referrer: string
  measures: ViewMeasures
  documentVersion: number
  startTime: number
  duration: number
  loadingTime?: number | undefined
  loadingType: ViewLoadingType
}

export interface ViewCreatedEvent {
  id: string
  location: Location
  referrer: string
  startTime: number
}

interface Timings {
  firstContentfulPaint?: number
  domInteractive?: number
  domContentLoaded?: number
  domComplete?: number
  loadEventEnd?: number
}

export type ViewMeasures = Timings & EventCounts

export enum ViewLoadingType {
  INITIAL_LOAD = 'initial_load',
  ROUTE_CHANGE = 'route_change',
}

export const THROTTLE_VIEW_UPDATE_PERIOD = 3000
export const SESSION_KEEP_ALIVE_INTERVAL = 5 * ONE_MINUTE

export function startViewCollection(location: Location, lifeCycle: LifeCycle) {
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
  let timings: Timings | undefined
  let documentVersion = 0
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

  // Initial view update
  triggerViewUpdate()

  function triggerViewUpdate() {
    documentVersion += 1
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
      documentVersion,
      id,
      loadingTime,
      loadingType,
      location,
      referrer,
      startTime,
      duration: (endTime === undefined ? performance.now() : endTime) - startTime,
      measures: { ...timings, ...eventCounts },
    })
  }

  return {
    scheduleUpdate: scheduleViewUpdate,
    end() {
      endTime = performance.now()
      stopEventCountsTracking()
      stopActivityLoadingTimeTracking()
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
  window.addEventListener(DOM_EVENT.POP_STATE, monitor(onHistoryChange))
}

function trackHash(onHashChange: () => void) {
  window.addEventListener('hashchange', monitor(onHashChange))
}

function trackTimings(lifeCycle: LifeCycle, callback: (timings: Timings) => void) {
  let timings: Timings | undefined
  const { unsubscribe: stopPerformanceTracking } = lifeCycle.subscribe(
    LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
    (entry) => {
      if (entry.entryType === 'navigation') {
        timings = {
          ...timings,
          domComplete: entry.domComplete,
          domContentLoaded: entry.domContentLoadedEventEnd,
          domInteractive: entry.domInteractive,
          loadEventEnd: entry.loadEventEnd,
        }
        callback(timings)
      } else if (entry.entryType === 'paint' && entry.name === 'first-contentful-paint') {
        timings = {
          ...timings,
          firstContentfulPaint: entry.startTime,
        }
        callback(timings)
      }
    }
  )
  return { stop: stopPerformanceTracking }
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

import { DOM_EVENT, generateUUID, monitor, msToNs, noop, ONE_MINUTE, throttle } from '@datadog/browser-core'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { ViewContext } from './parentContexts'
import { PerformancePaintTiming } from './rum'
import { RumSession } from './rumSession'
import { trackEventCounts } from './trackEventCounts'
import { waitIdlePageActivity } from './trackPageActivities'

export interface View {
  id: string
  location: Location
  measures: ViewMeasures
  documentVersion: number
  startTime: number
  duration: number
  loadingTime?: number | undefined
  loadingType: ViewLoadingType
}

export interface ViewMeasures {
  firstContentfulPaint?: number
  domInteractive?: number
  domContentLoaded?: number
  domComplete?: number
  loadEventEnd?: number
  errorCount: number
  resourceCount: number
  longTaskCount: number
  userActionCount: number
}

export enum ViewLoadingType {
  INITIAL_LOAD = 'initial_load',
  ROUTE_CHANGE = 'route_change',
}

export const THROTTLE_VIEW_UPDATE_PERIOD = 3000
export const SESSION_KEEP_ALIVE_INTERVAL = 5 * ONE_MINUTE

export function startViewCollection(location: Location, lifeCycle: LifeCycle, session: RumSession) {
  let currentLocation = { ...location }
  const startOrigin = 0
  let currentView = newView(lifeCycle, currentLocation, session, ViewLoadingType.INITIAL_LOAD, startOrigin)

  // Renew view on history changes
  trackHistory(() => {
    if (areDifferentViews(currentLocation, location)) {
      currentLocation = { ...location }
      currentView.triggerUpdate()
      currentView.end()
      currentView = newView(lifeCycle, currentLocation, session, ViewLoadingType.ROUTE_CHANGE)
    }
  })

  // Renew view on session renewal
  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    // do not trigger view update to avoid wrong data
    currentView.end()
    currentView = newView(lifeCycle, currentLocation, session, ViewLoadingType.ROUTE_CHANGE)
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
      currentView.end()
      clearInterval(keepAliveInterval)
    },
  }
}

export let viewContext: ViewContext

function newView(
  lifeCycle: LifeCycle,
  location: Location,
  session: RumSession,
  loadingType: ViewLoadingType,
  startTime: number = performance.now()
) {
  // Setup initial values
  const id = generateUUID()
  let measures: ViewMeasures = {
    errorCount: 0,
    longTaskCount: 0,
    resourceCount: 0,
    userActionCount: 0,
  }
  let documentVersion = 0
  let loadingTime: number | undefined

  viewContext = { id, location, sessionId: session.getId() }

  lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { viewContext, startTime })

  // Update the view every time the measures are changing
  const { throttled: scheduleViewUpdate, stop: stopScheduleViewUpdate } = throttle(
    monitor(updateView),
    THROTTLE_VIEW_UPDATE_PERIOD,
    {
      leading: false,
    }
  )
  function updateMeasures(newMeasures: Partial<ViewMeasures>) {
    measures = { ...measures, ...newMeasures }
    scheduleViewUpdate()
  }
  const { stop: stopTimingsTracking } = trackTimings(lifeCycle, updateMeasures)
  const { stop: stopEventCountsTracking } = trackEventCounts(lifeCycle, updateMeasures)

  function updateLoadingTime(loadingTimeValue: number) {
    loadingTime = loadingTimeValue
    scheduleViewUpdate()
  }
  const { stop: stopLoadingTimeTracking } = trackLoadingTime(lifeCycle, loadingType, updateLoadingTime)

  // Initial view update
  updateView()

  function updateView() {
    documentVersion += 1
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
      documentVersion,
      id,
      loadingTime,
      loadingType,
      location,
      measures,
      startTime,
      duration: performance.now() - startTime,
    })
  }

  return {
    end() {
      stopTimingsTracking()
      stopEventCountsTracking()
      stopLoadingTimeTracking()
      // prevent pending view updates execution
      stopScheduleViewUpdate()
    },
    triggerUpdate() {
      updateView()
    },
  }
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

function areDifferentViews(previous: Location, current: Location) {
  return previous.pathname !== current.pathname
}

interface Timings {
  domComplete?: number
  domContentLoaded?: number
  domInteractive?: number
  loadEventEnd?: number
  firstContentfulPaint?: number
}

function trackTimings(lifeCycle: LifeCycle, callback: (timings: Timings) => void) {
  let timings: Timings = {}
  const { unsubscribe: stopPerformanceTracking } = lifeCycle.subscribe(
    LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
    (entry) => {
      if (entry.entryType === 'navigation') {
        const navigationEntry = entry as PerformanceNavigationTiming
        timings = {
          ...timings,
          domComplete: msToNs(navigationEntry.domComplete),
          domContentLoaded: msToNs(navigationEntry.domContentLoadedEventEnd),
          domInteractive: msToNs(navigationEntry.domInteractive),
          loadEventEnd: msToNs(navigationEntry.loadEventEnd),
        }
        callback(timings)
      } else if (entry.entryType === 'paint' && entry.name === 'first-contentful-paint') {
        const paintEntry = entry as PerformancePaintTiming
        timings = {
          ...timings,
          firstContentfulPaint: msToNs(paintEntry.startTime),
        }
        callback(timings)
      }
    }
  )
  return { stop: stopPerformanceTracking }
}

function trackLoadingTime(
  lifeCycle: LifeCycle,
  loadingType: ViewLoadingType,
  callback: (loadingTimeValue: number) => void
) {
  let expectedTiming = 1
  const receivedTimings: number[] = []

  let stopLoadEventLoadingTime = noop
  if (loadingType === ViewLoadingType.INITIAL_LOAD) {
    expectedTiming += 1
    ;({ stop: stopLoadEventLoadingTime } = trackLoadEventLoadingTime(lifeCycle, onTimingValue))
  }

  const { stop: stopActivityLoadingTimeTracking } = trackActivityLoadingTime(lifeCycle, onTimingValue)

  function onTimingValue(timingValue: number | undefined) {
    expectedTiming -= 1
    if (timingValue) {
      receivedTimings.push(timingValue)
    }

    if (expectedTiming === 0 && receivedTimings.length) {
      callback(Math.max(...receivedTimings))
    }
  }

  return {
    stop() {
      stopActivityLoadingTimeTracking()
      stopLoadEventLoadingTime()
    },
  }
}

function trackLoadEventLoadingTime(lifeCycle: LifeCycle, callback: (loadingTimeValue: number) => void) {
  const { unsubscribe: stopPerformanceTracking } = lifeCycle.subscribe(
    LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
    (entry) => {
      if (entry.entryType === 'navigation') {
        const navigationEntry = entry as PerformanceNavigationTiming
        callback(navigationEntry.loadEventEnd)
      }
    }
  )

  return { stop: stopPerformanceTracking }
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

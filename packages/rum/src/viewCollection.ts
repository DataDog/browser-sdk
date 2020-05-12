import { DOM_EVENT, generateUUID, monitor, msToNs, throttle } from '@datadog/browser-core'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { PerformancePaintTiming } from './rum'
import { RumSession } from './rumSession'
import { trackEventCounts } from './trackEventCounts'
import { waitIdlePageActivity } from './trackPageActivities'
import { stopCurrentUserAction } from './userActionCollection'

export interface View {
  id: string
  location: Location
  measures: ViewMeasures
  documentVersion: number
  startTime: number
  duration: number
  loadDuration?: number
  loadType: ViewLoadType
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

export enum ViewLoadType {
  INITIAL_LOAD = 'initial load',
  ROUTE_CHANGE = 'route change',
}

export const THROTTLE_VIEW_UPDATE_PERIOD = 3000

export function startViewCollection(location: Location, lifeCycle: LifeCycle, session: RumSession) {
  let currentLocation = { ...location }
  const startOrigin = 0
  let currentView = newView(lifeCycle, currentLocation, session, ViewLoadType.INITIAL_LOAD, startOrigin)

  // Renew view on history changes
  trackHistory(() => {
    if (areDifferentViews(currentLocation, location)) {
      currentLocation = { ...location }
      currentView.end()
      currentView = newView(lifeCycle, currentLocation, session, ViewLoadType.ROUTE_CHANGE)
    }
  })

  // Renew view on session renewal
  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    currentView.end()
    currentView = newView(lifeCycle, currentLocation, session, ViewLoadType.ROUTE_CHANGE)
  })

  // End the current view on page unload
  lifeCycle.subscribe(LifeCycleEventType.BEFORE_UNLOAD, () => {
    currentView.end()
  })
}

interface ViewContext {
  id: string
  location: Location
  sessionId: string | undefined
  loadType: ViewLoadType
}

export let viewContext: ViewContext

export function newView(
  lifeCycle: LifeCycle,
  location: Location,
  session: RumSession,
  loadType: ViewLoadType,
  startOrigin: number = performance.now()
) {
  // Stop the current user action
  stopCurrentUserAction()

  // Setup initial values
  const id = generateUUID()
  let measures: ViewMeasures = {
    errorCount: 0,
    longTaskCount: 0,
    resourceCount: 0,
    userActionCount: 0,
  }
  let documentVersion = 0
  let loadDuration: number

  viewContext = { id, location, loadType, sessionId: session.getId() }

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

  function updateLoadDuration(loadDurationValue: number) {
    loadDuration = loadDurationValue
    scheduleViewUpdate()
  }
  const { stop: stopLoadDurationTracking } = trackLoadDuration(lifeCycle, updateLoadDuration)

  // Initial view update
  updateView()

  function updateView() {
    documentVersion += 1
    lifeCycle.notify(LifeCycleEventType.VIEW_COLLECTED, {
      documentVersion,
      id,
      loadDuration,
      loadType,
      location,
      measures,
      duration: performance.now() - startOrigin,
      startTime: startOrigin,
    })
  }

  return {
    end() {
      stopTimingsTracking()
      stopEventCountsTracking()
      stopLoadDurationTracking()
      // prevent pending view updates execution
      stopScheduleViewUpdate()
      // Make a final view update
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

function trackLoadDuration(lifeCycle: LifeCycle, callback: (loadDurationValue: number) => void) {
  const startTime: number = performance.now()
  const { stop: stopWaitIdlePageActivity } = waitIdlePageActivity(lifeCycle, (endTime) => {
    // If there is no activity during waitIdlePageActivity validation timeout,
    // it will not return an end time but the view is loaded as no activity has occured
    const loadingEndTime = endTime || performance.now()
    callback(loadingEndTime - startTime)
  })

  return { stop: stopWaitIdlePageActivity }
}

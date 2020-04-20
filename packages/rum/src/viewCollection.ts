import { DOM_EVENT, generateUUID, monitor, msToNs, throttle } from '@datadog/browser-core'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { PerformancePaintTiming } from './rum'
import { trackEventCounts } from './trackEventCounts'

export interface View {
  id: string
  location: Location
  measures: ViewMeasures
  documentVersion: number
  startTime: number
  duration: number
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

const THROTTLE_VIEW_UPDATE_PERIOD = 3000

export function startViewCollection(location: Location, lifeCycle: LifeCycle) {
  let currentLocation = { ...location }
  const startOrigin = 0
  let currentView = newView(lifeCycle, currentLocation, startOrigin)

  // Renew view on history changes
  trackHistory(() => {
    if (areDifferentViews(currentLocation, location)) {
      currentLocation = { ...location }
      currentView.end()
      currentView = newView(lifeCycle, currentLocation)
    }
  })

  // Renew view on session changes
  lifeCycle.subscribe(LifeCycleEventType.SESSION_WILL_RENEW, () => {
    currentView.end()
  })
  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    currentView = newView(lifeCycle, currentLocation)
  })

  // End the current view on page unload
  lifeCycle.subscribe(LifeCycleEventType.WILL_UNLOAD, () => {
    currentView.end()
  })
}

interface ViewContext {
  id: string
  location: Location
}

export let viewContext: ViewContext

function newView(lifeCycle: LifeCycle, location: Location, startOrigin: number = performance.now()) {
  // Setup initial values
  const id = generateUUID()
  let measures: ViewMeasures = {
    errorCount: 0,
    longTaskCount: 0,
    resourceCount: 0,
    userActionCount: 0,
  }
  let documentVersion = 0

  viewContext = { id, location }

  // Update the view every time the measures are changing
  const scheduleViewUpdate = throttle(monitor(updateView), THROTTLE_VIEW_UPDATE_PERIOD, {
    leading: false,
  })
  function updateMeasures(newMeasures: Partial<ViewMeasures>) {
    measures = { ...measures, ...newMeasures }
    scheduleViewUpdate()
  }
  const { stop: stopTimingsTracking } = trackTimings(lifeCycle, updateMeasures)
  const { stop: stopEventCountsTracking } = trackEventCounts(lifeCycle, updateMeasures)

  // Initial view update
  updateView()

  function updateView() {
    documentVersion += 1
    lifeCycle.notify(LifeCycleEventType.VIEW_COLLECTED, {
      documentVersion,
      id,
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
      // Make a final view update
      updateView()
    },
  }
}

function trackHistory(onChange: () => void) {
  const originalPushState = history.pushState
  history.pushState = monitor(function(this: History['pushState']) {
    originalPushState.apply(this, arguments as any)
    onChange()
  })
  const originalReplaceState = history.replaceState
  history.replaceState = monitor(function(this: History['replaceState']) {
    originalReplaceState.apply(this, arguments as any)
    onChange()
  })
  window.addEventListener(DOM_EVENT.POP_STATE, monitor(onChange))
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

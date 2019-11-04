import { Batch, generateUUID, monitor, msToNs, throttle } from '@browser-agent/core'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { PerformancePaintTiming, RumEvent, RumEventCategory } from './rum'

export interface ViewPerformance {
  firstContentfulPaint?: number
  domInteractive?: number
  domContentLoaded?: number
  domComplete?: number
  loadEventEnd?: number
}

export interface ViewSummary {
  customEventCount: number
  errorCount: number
  longTaskCount: number
}

export let viewId: string

const THROTTLE_VIEW_UPDATE_PERIOD = 3000
let startTimestamp: number
let startOrigin: number
let documentVersion: number
let activeLocation: Location
let viewSummary: ViewSummary
let viewPerformance: ViewPerformance

export function trackView(
  batch: Batch<RumEvent>,
  location: Location,
  lifeCycle: LifeCycle,
  addRumEvent: (event: RumEvent) => void
) {
  const scheduleViewUpdate = throttle(monitor(() => updateView(addRumEvent)), THROTTLE_VIEW_UPDATE_PERIOD, {
    leading: false,
  })

  newView(location, addRumEvent)
  trackHistory(location, addRumEvent)
  trackPerformance(lifeCycle, scheduleViewUpdate)
  trackSummary(lifeCycle, scheduleViewUpdate)

  batch.beforeFlushOnUnload(() => updateView(addRumEvent))
}

function newView(location: Location, addRumEvent: (event: RumEvent) => void) {
  viewId = generateUUID()
  startTimestamp = new Date().getTime()
  startOrigin = performance.now()
  documentVersion = 1
  viewSummary = {
    customEventCount: 0,
    errorCount: 0,
    longTaskCount: 0,
  }
  viewPerformance = {}
  activeLocation = { ...location }
  addViewEvent(addRumEvent)
}

function updateView(addRumEvent: (event: RumEvent) => void) {
  documentVersion += 1
  addViewEvent(addRumEvent)
}

function addViewEvent(addRumEvent: (event: RumEvent) => void) {
  addRumEvent({
    date: startTimestamp,
    duration: msToNs(performance.now() - startOrigin),
    evt: {
      category: RumEventCategory.VIEW,
    },
    rum: {
      documentVersion,
    },
    view: {
      performance: viewPerformance,
      summary: viewSummary,
    },
  })
}

function trackHistory(location: Location, addRumEvent: (event: RumEvent) => void) {
  const originalPushState = history.pushState
  history.pushState = monitor(function(this: History['pushState']) {
    originalPushState.apply(this, arguments as any)
    onUrlChange(location, addRumEvent)
  })
  const originalReplaceState = history.replaceState
  history.replaceState = monitor(function(this: History['replaceState']) {
    originalReplaceState.apply(this, arguments as any)
    onUrlChange(location, addRumEvent)
  })
  window.addEventListener('popstate', () => {
    onUrlChange(location, addRumEvent)
  })
}

function onUrlChange(location: Location, addRumEvent: (event: RumEvent) => void) {
  if (areDifferentViews(activeLocation, location)) {
    updateView(addRumEvent)
    newView(location, addRumEvent)
  }
}

function areDifferentViews(previous: Location, current: Location) {
  return previous.pathname !== current.pathname
}

function trackPerformance(lifeCycle: LifeCycle, scheduleViewUpdate: () => void) {
  lifeCycle.subscribe(LifeCycleEventType.performance, (entry) => {
    if (entry.entryType === 'navigation') {
      const navigationEntry = entry as PerformanceNavigationTiming
      viewPerformance = {
        ...viewPerformance,
        domComplete: msToNs(navigationEntry.domComplete),
        domContentLoaded: msToNs(navigationEntry.domContentLoadedEventEnd),
        domInteractive: msToNs(navigationEntry.domInteractive),
        loadEventEnd: msToNs(navigationEntry.loadEventEnd),
      }
      scheduleViewUpdate()
    } else if (entry.entryType === 'paint' && entry.name === 'first-contentful-paint') {
      const paintEntry = entry as PerformancePaintTiming
      viewPerformance = {
        ...viewPerformance,
        firstContentfulPaint: msToNs(paintEntry.startTime),
      }
      scheduleViewUpdate()
    }
  })
}

function trackSummary(lifeCycle: LifeCycle, scheduleViewUpdate: () => void) {
  lifeCycle.subscribe(LifeCycleEventType.error, () => {
    viewSummary.errorCount += 1
    scheduleViewUpdate()
  })
  lifeCycle.subscribe(LifeCycleEventType.customEvent, () => {
    viewSummary.customEventCount += 1
    scheduleViewUpdate()
  })
  lifeCycle.subscribe(LifeCycleEventType.performance, (entry) => {
    if (entry.entryType === 'longtask') {
      viewSummary.longTaskCount += 1
      scheduleViewUpdate()
    }
  })
}

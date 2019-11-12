import { Batch, generateUUID, monitor, msToNs, throttle } from '@browser-agent/core'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { PerformancePaintTiming, RumEvent, RumEventCategory, RumViewEvent } from './rum'

export interface ViewMeasures {
  firstContentfulPaint?: number
  domInteractive?: number
  domContentLoaded?: number
  domComplete?: number
  loadEventEnd?: number
  userActionCount: number
  errorCount: number
  longTaskCount: number
}

export let viewId: string

const THROTTLE_VIEW_UPDATE_PERIOD = 3000
let startTimestamp: number
let startOrigin: number
let documentVersion: number
let activeLocation: Location
let viewMeasures: ViewMeasures

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
  trackMeasures(lifeCycle, scheduleViewUpdate)

  batch.beforeFlushOnUnload(() => updateView(addRumEvent))
}

function newView(location: Location, addRumEvent: (event: RumEvent) => void) {
  viewId = generateUUID()
  startTimestamp = new Date().getTime()
  startOrigin = performance.now()
  documentVersion = 1
  viewMeasures = {
    errorCount: 0,
    longTaskCount: 0,
    userActionCount: 0,
  }
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
      measures: viewMeasures,
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

function trackMeasures(lifeCycle: LifeCycle, scheduleViewUpdate: () => void) {
  lifeCycle.subscribe(LifeCycleEventType.performance, (entry) => {
    if (entry.entryType === 'navigation') {
      const navigationEntry = entry as PerformanceNavigationTiming
      viewMeasures = {
        ...viewMeasures,
        domComplete: msToNs(navigationEntry.domComplete),
        domContentLoaded: msToNs(navigationEntry.domContentLoadedEventEnd),
        domInteractive: msToNs(navigationEntry.domInteractive),
        loadEventEnd: msToNs(navigationEntry.loadEventEnd),
      }
      scheduleViewUpdate()
    } else if (entry.entryType === 'paint' && entry.name === 'first-contentful-paint') {
      const paintEntry = entry as PerformancePaintTiming
      viewMeasures = {
        ...viewMeasures,
        firstContentfulPaint: msToNs(paintEntry.startTime),
      }
      scheduleViewUpdate()
    }
  })
  lifeCycle.subscribe(LifeCycleEventType.error, () => {
    viewMeasures.errorCount += 1
    scheduleViewUpdate()
  })
  lifeCycle.subscribe(LifeCycleEventType.userAction, () => {
    viewMeasures.userActionCount += 1
    scheduleViewUpdate()
  })
  lifeCycle.subscribe(LifeCycleEventType.performance, (entry) => {
    if (entry.entryType === 'longtask') {
      viewMeasures.longTaskCount += 1
      scheduleViewUpdate()
    }
  })
}

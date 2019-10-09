import { ErrorObservable } from '../core/errorCollection'
import { monitor } from '../core/internalMonitoring'
import { Observable } from '../core/observable'
import { Batch } from '../core/transport'
import { generateUUID, msToNs } from '../core/utils'
import { PerformancePaintTiming, RawCustomEvent, RumEvent, RumEventCategory } from './rum'

export interface PageViewPerformance {
  firstContentfulPaint?: number
  domInteractive?: number
  domContentLoadedEventEnd?: number
  domComplete?: number
  loadEventEnd?: number
}

export interface PageViewSummary {
  customEventCount: number
  errorCount: number
  longTaskCount: number
}

export let pageViewId: string

let startTimestamp: number
let startOrigin: number
let documentVersion: number
let activeLocation: Location
let summary: PageViewSummary
let screenPerformance: PageViewPerformance

export function trackPageView(
  batch: Batch<RumEvent>,
  location: Location,
  addRumEvent: (event: RumEvent) => void,
  errorObservable: ErrorObservable,
  performanceObservable: Observable<PerformanceEntry>,
  customEventObservable: Observable<RawCustomEvent>
) {
  newPageView(location, addRumEvent)
  trackHistory(location, addRumEvent)
  trackPerformance(performanceObservable)
  trackSummary(errorObservable, performanceObservable, customEventObservable)

  batch.beforeFlushOnUnload(() => updatePageView(addRumEvent))
}
function newPageView(location: Location, addRumEvent: (event: RumEvent) => void) {
  pageViewId = generateUUID()
  startTimestamp = new Date().getTime()
  startOrigin = performance.now()
  documentVersion = 1
  summary = {
    customEventCount: 0,
    errorCount: 0,
    longTaskCount: 0,
  }
  screenPerformance = {}
  activeLocation = { ...location }
  addPageViewEvent(addRumEvent)
}

function updatePageView(addRumEvent: (event: RumEvent) => void) {
  documentVersion += 1
  addPageViewEvent(addRumEvent)
}

function addPageViewEvent(addRumEvent: (event: RumEvent) => void) {
  addRumEvent({
    date: startTimestamp,
    duration: msToNs(performance.now() - startOrigin),
    evt: {
      category: RumEventCategory.PAGE_VIEW,
    },
    rum: {
      documentVersion,
    },
    screen: {
      summary,
      performance: screenPerformance,
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
  if (areDifferentPages(activeLocation, location)) {
    updatePageView(addRumEvent)
    newPageView(location, addRumEvent)
  }
}

function areDifferentPages(previous: Location, current: Location) {
  return previous.pathname !== current.pathname
}

function trackPerformance(performanceObservable: Observable<PerformanceEntry>) {
  performanceObservable.subscribe((entry) => {
    if (entry.entryType === 'navigation') {
      const navigationEntry = entry as PerformanceNavigationTiming
      screenPerformance = {
        ...screenPerformance,
        domComplete: msToNs(navigationEntry.domComplete),
        domContentLoadedEventEnd: msToNs(navigationEntry.domContentLoadedEventEnd),
        domInteractive: msToNs(navigationEntry.domInteractive),
        loadEventEnd: msToNs(navigationEntry.loadEventEnd),
      }
    } else if (entry.entryType === 'paint' && entry.name === 'first-contentful-paint') {
      const paintEntry = entry as PerformancePaintTiming
      screenPerformance = {
        ...screenPerformance,
        firstContentfulPaint: msToNs(paintEntry.startTime),
      }
    }
  })
}

function trackSummary(
  errorObservable: ErrorObservable,
  performanceObservable: Observable<PerformanceEntry>,
  customEventObservable: Observable<RawCustomEvent>
) {
  errorObservable.subscribe(() => (summary.errorCount += 1))
  customEventObservable.subscribe(() => (summary.customEventCount += 1))
  performanceObservable.subscribe((entry) => {
    if (entry.entryType === 'longtask') {
      summary.longTaskCount += 1
    }
  })
}

import { addMonitoringMessage, generateUUID, monitor, msToNs, throttle } from '@datadog/browser-core'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { PerformancePaintTiming, RumEvent, RumEventCategory } from './rum'
import { RumSession } from './rumSession'

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

interface ViewContext {
  id: string
  location: Location
  sessionId: string | undefined
}

export let viewContext: ViewContext

const THROTTLE_VIEW_UPDATE_PERIOD = 3000
let startTimestamp: number
let startOrigin: number
let documentVersion: number
let viewMeasures: ViewMeasures

export function trackView(
  location: Location,
  lifeCycle: LifeCycle,
  session: RumSession,
  addRumEvent: (event: RumEvent) => void,
  beforeFlushOnUnload: (handler: () => void) => void
) {
  const scheduleViewUpdate = throttle(monitor(() => updateView(addRumEvent)), THROTTLE_VIEW_UPDATE_PERIOD, {
    leading: false,
  })

  newView(location, session, addRumEvent)
  trackHistory(location, session, addRumEvent)
  trackMeasures(lifeCycle, scheduleViewUpdate)
  trackRenewSession(location, lifeCycle, session, addRumEvent)

  beforeFlushOnUnload(() => updateView(addRumEvent))
}

function newView(location: Location, session: RumSession, addRumEvent: (event: RumEvent) => void) {
  viewContext = {
    id: generateUUID(),
    location: { ...location },
    sessionId: session.getId(),
  }
  startTimestamp = new Date().getTime()
  startOrigin = performance.now()
  documentVersion = 1
  viewMeasures = {
    errorCount: 0,
    longTaskCount: 0,
    resourceCount: 0,
    userActionCount: 0,
  }
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

function trackHistory(location: Location, session: RumSession, addRumEvent: (event: RumEvent) => void) {
  const originalPushState = history.pushState
  history.pushState = monitor(function(this: History['pushState']) {
    originalPushState.apply(this, arguments as any)
    onUrlChange(location, session, addRumEvent)
  })
  const originalReplaceState = history.replaceState
  history.replaceState = monitor(function(this: History['replaceState']) {
    originalReplaceState.apply(this, arguments as any)
    onUrlChange(location, session, addRumEvent)
  })
  window.addEventListener('popstate', () => {
    onUrlChange(location, session, addRumEvent)
  })
}

function onUrlChange(location: Location, session: RumSession, addRumEvent: (event: RumEvent) => void) {
  if (areDifferentViews(viewContext.location, location)) {
    updateView(addRumEvent)
    newView(location, session, addRumEvent)
  }
}

function areDifferentViews(previous: Location, current: Location) {
  return previous.pathname !== current.pathname
}

function reportAbnormalLoadEvent(navigationEntry: PerformanceNavigationTiming) {
  if (navigationEntry.loadEventEnd > 86400e3 /* one day in ms */) {
    addMonitoringMessage(
      `Got an abnormal load event in a PerformanceNavigationTiming entry!
Session Id: ${viewContext.sessionId}
View Id: ${viewContext.id}
View start date: ${startTimestamp}
Document Version: ${documentVersion}
Entry: ${JSON.stringify(navigationEntry)}
Previous measures: ${JSON.stringify(viewMeasures)}`
    )
  }
}

function trackMeasures(lifeCycle: LifeCycle, scheduleViewUpdate: () => void) {
  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (entry.entryType === 'navigation') {
      const navigationEntry = entry as PerformanceNavigationTiming
      reportAbnormalLoadEvent(navigationEntry)
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
  lifeCycle.subscribe(LifeCycleEventType.ERROR_COLLECTED, () => {
    viewMeasures.errorCount += 1
    scheduleViewUpdate()
  })
  lifeCycle.subscribe(LifeCycleEventType.USER_ACTION_COLLECTED, () => {
    viewMeasures.userActionCount += 1
    scheduleViewUpdate()
  })
  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (entry.entryType === 'longtask') {
      viewMeasures.longTaskCount += 1
      scheduleViewUpdate()
    }
  })
  lifeCycle.subscribe(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH, () => {
    viewMeasures.resourceCount += 1
    scheduleViewUpdate()
  })
}

function trackRenewSession(
  location: Location,
  lifeCycle: LifeCycle,
  session: RumSession,
  addRumEvent: (event: RumEvent) => void
) {
  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    updateView(addRumEvent)
    newView(location, session, addRumEvent)
  })
}

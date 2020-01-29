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
  upsertRumEvent: (event: RumEvent, key: string) => void,
  beforeFlushOnUnload: (handler: () => void) => void
) {
  const scheduleViewUpdate = throttle(monitor(() => updateView(upsertRumEvent)), THROTTLE_VIEW_UPDATE_PERIOD, {
    leading: false,
  })

  newView(location, session, upsertRumEvent)
  trackHistory(location, session, upsertRumEvent)
  trackMeasures(lifeCycle, scheduleViewUpdate)
  trackRenewSession(location, lifeCycle, session, upsertRumEvent)

  beforeFlushOnUnload(() => updateView(upsertRumEvent))
}

function newView(location: Location, session: RumSession, upsertRumEvent: (event: RumEvent, key: string) => void) {
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
  upsertViewEvent(upsertRumEvent)
}

function updateView(upsertRumEvent: (event: RumEvent, key: string) => void) {
  documentVersion += 1
  upsertViewEvent(upsertRumEvent)
}

function upsertViewEvent(upsertRumEvent: (event: RumEvent, key: string) => void) {
  upsertRumEvent(
    {
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
    },
    viewContext.id
  )
}

function trackHistory(location: Location, session: RumSession, upsertRumEvent: (event: RumEvent, key: string) => void) {
  const originalPushState = history.pushState
  history.pushState = monitor(function(this: History['pushState']) {
    originalPushState.apply(this, arguments as any)
    onUrlChange(location, session, upsertRumEvent)
  })
  const originalReplaceState = history.replaceState
  history.replaceState = monitor(function(this: History['replaceState']) {
    originalReplaceState.apply(this, arguments as any)
    onUrlChange(location, session, upsertRumEvent)
  })
  window.addEventListener('popstate', () => {
    onUrlChange(location, session, upsertRumEvent)
  })
}

function onUrlChange(location: Location, session: RumSession, upsertRumEvent: (event: RumEvent, key: string) => void) {
  if (areDifferentViews(viewContext.location, location)) {
    updateView(upsertRumEvent)
    newView(location, session, upsertRumEvent)
  }
}

function areDifferentViews(previous: Location, current: Location) {
  return previous.pathname !== current.pathname
}

function reportAbnormalLoadEvent(navigationEntry: PerformanceNavigationTiming) {
  if (
    navigationEntry.loadEventEnd > 86400e3 /* one day in ms */ ||
    navigationEntry.loadEventEnd > performance.now() + 60e3 /* one minute in ms */
  ) {
    addMonitoringMessage(
      `Got an abnormal load event in a PerformanceNavigationTiming entry!
Session Id: ${viewContext.sessionId}
View Id: ${viewContext.id}
Load event: ${navigationEntry.loadEventEnd}
View start date: ${startTimestamp}
Page duration: ${performance.now()}
View duration: ${performance.now() - startOrigin}
Document Version: ${documentVersion}
Entry: ${JSON.stringify(navigationEntry)}
Perf timing: ${JSON.stringify(performance.timing)}
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
  upsertRumEvent: (event: RumEvent, key: string) => void
) {
  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    updateView(upsertRumEvent)
    newView(location, session, upsertRumEvent)
  })
}

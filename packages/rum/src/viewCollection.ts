import { DOM_EVENT, generateUUID, getTimestamp, monitor, msToNs, throttle } from '@datadog/browser-core'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { PerformancePaintTiming, RumEvent, RumEventCategory } from './rum'
import { trackEventCounts } from './trackEventCounts'

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
}

export let viewContext: ViewContext

const THROTTLE_VIEW_UPDATE_PERIOD = 3000
let startOrigin: number
let documentVersion: number
let viewMeasures: ViewMeasures

export function trackView(
  location: Location,
  lifeCycle: LifeCycle,
  upsertRumEvent: (event: RumEvent, key: string) => void
) {
  const scheduleViewUpdate = throttle(monitor(() => updateView(upsertRumEvent)), THROTTLE_VIEW_UPDATE_PERIOD, {
    leading: false,
  })

  const { reset: resetEventCounts } = trackEventCounts(lifeCycle, (eventCounts) => {
    viewMeasures = { ...viewMeasures, ...eventCounts }
    scheduleViewUpdate()
  })
  newView(location, resetEventCounts, upsertRumEvent)
  trackHistory(location, resetEventCounts, upsertRumEvent)
  trackTimings(lifeCycle, scheduleViewUpdate)
  trackRenewSession(location, lifeCycle, resetEventCounts, upsertRumEvent)

  lifeCycle.subscribe(LifeCycleEventType.WILL_UNLOAD, () => updateView(upsertRumEvent))
}

function newView(
  location: Location,
  resetEventCounts: () => void,
  upsertRumEvent: (event: RumEvent, key: string) => void
) {
  startOrigin = !viewContext ? 0 : performance.now()
  viewContext = {
    id: generateUUID(),
    location: { ...location },
  }
  documentVersion = 1
  viewMeasures = {
    errorCount: 0,
    longTaskCount: 0,
    resourceCount: 0,
    userActionCount: 0,
  }
  resetEventCounts()
  upsertViewEvent(upsertRumEvent)
}

function updateView(upsertRumEvent: (event: RumEvent, key: string) => void) {
  documentVersion += 1
  upsertViewEvent(upsertRumEvent)
}

function upsertViewEvent(upsertRumEvent: (event: RumEvent, key: string) => void) {
  upsertRumEvent(
    {
      date: getTimestamp(startOrigin),
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

function trackHistory(
  location: Location,
  resetEventCounts: () => void,
  upsertRumEvent: (event: RumEvent, key: string) => void
) {
  const originalPushState = history.pushState
  history.pushState = monitor(function(this: History['pushState']) {
    originalPushState.apply(this, arguments as any)
    onUrlChange(location, resetEventCounts, upsertRumEvent)
  })
  const originalReplaceState = history.replaceState
  history.replaceState = monitor(function(this: History['replaceState']) {
    originalReplaceState.apply(this, arguments as any)
    onUrlChange(location, resetEventCounts, upsertRumEvent)
  })
  window.addEventListener(
    DOM_EVENT.POP_STATE,
    monitor(() => {
      onUrlChange(location, resetEventCounts, upsertRumEvent)
    })
  )
}

function onUrlChange(
  location: Location,
  resetEventCounts: () => void,
  upsertRumEvent: (event: RumEvent, key: string) => void
) {
  if (areDifferentViews(viewContext.location, location)) {
    updateView(upsertRumEvent)
    newView(location, resetEventCounts, upsertRumEvent)
  }
}

function areDifferentViews(previous: Location, current: Location) {
  return previous.pathname !== current.pathname
}

function trackTimings(lifeCycle: LifeCycle, scheduleViewUpdate: () => void) {
  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
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
}

function trackRenewSession(
  location: Location,
  lifeCycle: LifeCycle,
  resetEventCounts: () => void,
  upsertRumEvent: (event: RumEvent, key: string) => void
) {
  lifeCycle.subscribe(LifeCycleEventType.SESSION_WILL_RENEW, () => {
    updateView(upsertRumEvent)
  })

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    newView(location, resetEventCounts, upsertRumEvent)
  })
}

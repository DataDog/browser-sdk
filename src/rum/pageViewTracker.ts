import { monitor } from '../core/internalMonitoring'
import { Batch } from '../core/transport'
import { generateUUID, msToNs } from '../core/utils'
import { RumEvent, RumEventCategory } from './rum'

export let pageViewId: string

let startTimestamp: number
let startOrigin: number
let documentVersion: number
let activeLocation: Location

export function trackPageView(batch: Batch<RumEvent>, location: Location, addRumEvent: (event: RumEvent) => void) {
  newPageView(location, addRumEvent)
  trackHistory(location, addRumEvent)
  batch.beforeFlushOnUnload(() => updatePageView(addRumEvent))
}

function newPageView(location: Location, addRumEvent: (event: RumEvent) => void) {
  pageViewId = generateUUID()
  startTimestamp = new Date().getTime()
  startOrigin = performance.now()
  documentVersion = 1
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

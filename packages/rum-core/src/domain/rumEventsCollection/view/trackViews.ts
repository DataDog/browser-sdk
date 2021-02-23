import { addEventListener, DOM_EVENT, generateUUID, monitor, noop, ONE_MINUTE, throttle } from '@datadog/browser-core'
import { NewLocationListener } from '../../../boot/rum'

import { supportPerformanceTimingEvent } from '../../../browser/performanceCollection'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { EventCounts, trackEventCounts } from '../../trackEventCounts'
import { waitIdlePageActivity } from '../../trackPageActivities'
import { ViewLoadingType, ViewCustomTimings } from '../../../rawRumEvent.types'
import { Timings, trackTimings } from './trackTimings'

export interface View {
  id: string
  name?: string
  location: Location
  referrer: string
  timings: Timings
  customTimings: ViewCustomTimings
  eventCounts: EventCounts
  documentVersion: number
  startTime: number
  duration: number
  isActive: boolean
  loadingTime?: number | undefined
  loadingType: ViewLoadingType
  cumulativeLayoutShift?: number
}

export interface ViewCreatedEvent {
  id: string
  name?: string
  location: Location
  referrer: string
  startTime: number
}

export const THROTTLE_VIEW_UPDATE_PERIOD = 3000
export const SESSION_KEEP_ALIVE_INTERVAL = 5 * ONE_MINUTE

export function trackViews(
  location: Location,
  lifeCycle: LifeCycle,
  onNewLocation: NewLocationListener = () => undefined
) {
  onNewLocation = wrapOnNewLocation(onNewLocation)
  const startOrigin = 0
  const initialView = newView(
    lifeCycle,
    location,
    ViewLoadingType.INITIAL_LOAD,
    document.referrer,
    startOrigin,
    onNewLocation(location)?.viewName
  )
  let currentView = initialView

  const { stop: stopTimingsTracking } = trackTimings(lifeCycle, (timings) => {
    initialView.updateTimings(timings)
    initialView.scheduleUpdate()
  })

  const { stop: stopHistoryTracking } = trackHistory(onLocationChange)
  const { stop: stopHashTracking } = trackHash(onLocationChange)

  function onLocationChange() {
    const { viewName, shouldCreateView } = onNewLocation(location, currentView.getLocation()) || {}
    if (shouldCreateView || (shouldCreateView === undefined && currentView.isDifferentView(location))) {
      // Renew view on location changes
      currentView.end()
      currentView.triggerUpdate()
      currentView = newView(lifeCycle, location, ViewLoadingType.ROUTE_CHANGE, currentView.url, undefined, viewName)
      return
    }
    currentView.updateLocation(location)
    currentView.triggerUpdate()
  }

  // Renew view on session renewal
  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    // do not trigger view update to avoid wrong data
    currentView.end()
    currentView = newView(lifeCycle, location, ViewLoadingType.ROUTE_CHANGE, currentView.url)
  })

  // End the current view on page unload
  lifeCycle.subscribe(LifeCycleEventType.BEFORE_UNLOAD, () => {
    currentView.end()
    currentView.triggerUpdate()
  })

  // Session keep alive
  const keepAliveInterval = window.setInterval(
    monitor(() => {
      currentView.triggerUpdate()
    }),
    SESSION_KEEP_ALIVE_INTERVAL
  )

  return {
    addTiming: (name: string, time = performance.now()) => {
      currentView.addTiming(name, time)
      currentView.triggerUpdate()
    },
    stop: () => {
      stopHistoryTracking()
      stopHashTracking()
      stopTimingsTracking()
      currentView.end()
      clearInterval(keepAliveInterval)
    },
  }
}

function newView(
  lifeCycle: LifeCycle,
  initialLocation: Location,
  loadingType: ViewLoadingType,
  referrer: string,
  startTime: number = performance.now(),
  name?: string
) {
  // Setup initial values
  const id = generateUUID()
  let eventCounts: EventCounts = {
    errorCount: 0,
    longTaskCount: 0,
    resourceCount: 0,
    userActionCount: 0,
  }
  let timings: Timings = {}
  const customTimings: ViewCustomTimings = {}
  let documentVersion = 0
  let cumulativeLayoutShift: number | undefined
  let loadingTime: number | undefined
  let endTime: number | undefined
  let location: Location = { ...initialLocation }

  lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { id, startTime, location, referrer })

  // Update the view every time the measures are changing
  const { throttled: scheduleViewUpdate, cancel: cancelScheduleViewUpdate } = throttle(
    monitor(triggerViewUpdate),
    THROTTLE_VIEW_UPDATE_PERIOD,
    {
      leading: false,
    }
  )

  const { stop: stopEventCountsTracking } = trackEventCounts(lifeCycle, (newEventCounts) => {
    eventCounts = newEventCounts
    scheduleViewUpdate()
  })

  const { setActivityLoadingTime, setLoadEvent } = trackLoadingTime(loadingType, (newLoadingTime) => {
    loadingTime = newLoadingTime
    scheduleViewUpdate()
  })

  const { stop: stopActivityLoadingTimeTracking } = trackActivityLoadingTime(lifeCycle, setActivityLoadingTime)

  let stopCLSTracking: () => void
  if (isLayoutShiftSupported()) {
    cumulativeLayoutShift = 0
    ;({ stop: stopCLSTracking } = trackLayoutShift(lifeCycle, (layoutShift) => {
      cumulativeLayoutShift! += layoutShift
      scheduleViewUpdate()
    }))
  } else {
    stopCLSTracking = noop
  }

  // Initial view update
  triggerViewUpdate()

  function triggerViewUpdate() {
    documentVersion += 1
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
      cumulativeLayoutShift,
      customTimings,
      documentVersion,
      eventCounts,
      id,
      name,
      loadingTime,
      loadingType,
      location,
      referrer,
      startTime,
      timings,
      duration: (endTime === undefined ? performance.now() : endTime) - startTime,
      isActive: endTime === undefined,
    })
  }

  return {
    scheduleUpdate: scheduleViewUpdate,
    end() {
      endTime = performance.now()
      stopEventCountsTracking()
      stopActivityLoadingTimeTracking()
      stopCLSTracking()
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED)
    },
    isDifferentView(otherLocation: Location) {
      return (
        location.pathname !== otherLocation.pathname ||
        (!isHashAnAnchor(otherLocation.hash) && otherLocation.hash !== location.hash)
      )
    },
    getLocation() {
      return location
    },
    triggerUpdate() {
      // cancel any pending view updates execution
      cancelScheduleViewUpdate()
      triggerViewUpdate()
    },
    updateTimings(newTimings: Timings) {
      timings = newTimings
      if (newTimings.loadEvent !== undefined) {
        setLoadEvent(newTimings.loadEvent)
      }
    },
    addTiming(name: string, time: number) {
      customTimings[sanitizeTiming(name)] = time - startTime
    },
    updateLocation(newLocation: Location) {
      location = { ...newLocation }
    },
    get url() {
      return location.href
    },
  }
}

function isHashAnAnchor(hash: string) {
  const correspondingId = hash.substr(1)
  return !!document.getElementById(correspondingId)
}

function trackHistory(onHistoryChange: () => void) {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalPushState = history.pushState
  history.pushState = monitor(function (this: History['pushState']) {
    originalPushState.apply(this, arguments as any)
    onHistoryChange()
  })
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalReplaceState = history.replaceState
  history.replaceState = monitor(function (this: History['replaceState']) {
    originalReplaceState.apply(this, arguments as any)
    onHistoryChange()
  })
  const { stop: removeListener } = addEventListener(window, DOM_EVENT.POP_STATE, onHistoryChange)
  const stop = () => {
    removeListener()
    history.pushState = originalPushState
    history.replaceState = originalReplaceState
  }
  return { stop }
}

function trackHash(onHashChange: () => void) {
  return addEventListener(window, DOM_EVENT.HASH_CHANGE, onHashChange)
}

function trackLoadingTime(loadType: ViewLoadingType, callback: (loadingTime: number) => void) {
  let isWaitingForLoadEvent = loadType === ViewLoadingType.INITIAL_LOAD
  let isWaitingForActivityLoadingTime = true
  const loadingTimeCandidates: number[] = []

  function invokeCallbackIfAllCandidatesAreReceived() {
    if (!isWaitingForActivityLoadingTime && !isWaitingForLoadEvent && loadingTimeCandidates.length > 0) {
      callback(Math.max(...loadingTimeCandidates))
    }
  }

  return {
    setLoadEvent: (loadEvent: number) => {
      if (isWaitingForLoadEvent) {
        isWaitingForLoadEvent = false
        loadingTimeCandidates.push(loadEvent)
        invokeCallbackIfAllCandidatesAreReceived()
      }
    },
    setActivityLoadingTime: (activityLoadingTime: number | undefined) => {
      if (isWaitingForActivityLoadingTime) {
        isWaitingForActivityLoadingTime = false
        if (activityLoadingTime !== undefined) {
          loadingTimeCandidates.push(activityLoadingTime)
        }
        invokeCallbackIfAllCandidatesAreReceived()
      }
    },
  }
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

/**
 * Track layout shifts (LS) occuring during the Views.  This yields multiple values that can be
 * added up to compute the cumulated layout shift (CLS).
 *
 * See isLayoutShiftSupported to check for browser support.
 *
 * Documentation: https://web.dev/cls/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/master/src/getCLS.ts
 */
function trackLayoutShift(lifeCycle: LifeCycle, callback: (layoutShift: number) => void) {
  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (entry.entryType === 'layout-shift' && !entry.hadRecentInput) {
      callback(entry.value)
    }
  })

  return {
    stop,
  }
}

/**
 * Check whether `layout-shift` is supported by the browser.
 */
function isLayoutShiftSupported() {
  return supportPerformanceTimingEvent('layout-shift')
}

/**
 * Timing name is used as facet path that must contain only letters, digits, or the characters - _ . @ $
 */
function sanitizeTiming(name: string) {
  const sanitized = name.replace(/[^a-zA-Z0-9-_.@$]/g, '_')
  if (sanitized !== name) {
    console.warn(`Invalid timing name: ${name}, sanitized to: ${sanitized}`)
  }
  return sanitized
}

function wrapOnNewLocation(onNewLocation: NewLocationListener): NewLocationListener {
  return (newLocation, oldLocation) => {
    let result
    try {
      result = onNewLocation(newLocation, oldLocation)
    } catch (err) {
      console.error('onNewLocation threw an error:', err)
    }
    return result
  }
}

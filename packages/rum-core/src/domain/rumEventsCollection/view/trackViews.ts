import {
  Duration,
  elapsed,
  generateUUID,
  monitor,
  ONE_MINUTE,
  relativeNow,
  RelativeTime,
  throttle,
} from '@datadog/browser-core'

import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { EventCounts } from '../../trackEventCounts'
import { ViewLoadingType, ViewCustomTimings } from '../../../rawRumEvent.types'
import { Timings, trackInitialViewTimings } from './trackInitialViewTimings'
import { trackViewMetrics } from './trackViewMetrics'
import { trackLocationChanges, areDifferentLocation } from './trackLocationChanges'

export interface ViewEvent {
  id: string
  name?: string
  location: Location
  referrer: string
  timings: Timings
  customTimings: ViewCustomTimings
  eventCounts: EventCounts
  documentVersion: number
  startTime: RelativeTime
  duration: Duration
  isActive: boolean
  loadingTime?: Duration
  loadingType: ViewLoadingType
  cumulativeLayoutShift?: number
  hasReplay: boolean
}

export interface ViewCreatedEvent {
  id: string
  name?: string
  location: Location
  referrer: string
  startTime: RelativeTime
}

export const THROTTLE_VIEW_UPDATE_PERIOD = 3000
export const SESSION_KEEP_ALIVE_INTERVAL = 5 * ONE_MINUTE

export function trackViews(location: Location, lifeCycle: LifeCycle) {
  let isRecording = false

  // eslint-disable-next-line prefer-const
  let { stop: stopInitialViewTracking, initialView: currentView } = trackInitialView()
  const { stop: stopLocationChangesTracking } = trackLocationChanges(() => {
    if (areDifferentLocation(currentView.getLocation(), location)) {
      // Renew view on location changes
      currentView.end()
      currentView.triggerUpdate()
      currentView = trackViewChange()
      return
    }
    currentView.updateLocation(location)
    currentView.triggerUpdate()
  })

  // Renew view on session renewal
  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    // do not trigger view update to avoid wrong data
    currentView.end()
    currentView = trackViewChange()
  })

  // End the current view on page unload
  lifeCycle.subscribe(LifeCycleEventType.BEFORE_UNLOAD, () => {
    currentView.end()
    currentView.triggerUpdate()
  })

  lifeCycle.subscribe(LifeCycleEventType.RECORD_STARTED, () => {
    isRecording = true
    currentView.updateHasReplay(true)
  })

  lifeCycle.subscribe(LifeCycleEventType.RECORD_STOPPED, () => {
    isRecording = false
  })

  // Session keep alive
  const keepAliveInterval = window.setInterval(
    monitor(() => {
      currentView.triggerUpdate()
    }),
    SESSION_KEEP_ALIVE_INTERVAL
  )

  function trackInitialView() {
    const startOrigin = 0 as RelativeTime
    const initialView = newView(
      lifeCycle,
      location,
      isRecording,
      ViewLoadingType.INITIAL_LOAD,
      document.referrer,
      startOrigin
    )
    const { stop } = trackInitialViewTimings(lifeCycle, (timings) => {
      initialView.updateTimings(timings)
      initialView.scheduleUpdate()
    })
    return { initialView, stop }
  }

  function trackViewChange() {
    return newView(lifeCycle, location, isRecording, ViewLoadingType.ROUTE_CHANGE, currentView.url)
  }

  return {
    addTiming: (name: string, time = relativeNow()) => {
      currentView.addTiming(name, time)
      currentView.triggerUpdate()
    },
    stop: () => {
      stopInitialViewTracking()
      stopLocationChangesTracking()
      currentView.end()
      clearInterval(keepAliveInterval)
    },
  }
}

function newView(
  lifeCycle: LifeCycle,
  initialLocation: Location,
  initialHasReplay: boolean,
  loadingType: ViewLoadingType,
  referrer: string,
  startTime = relativeNow(),
  name?: string
) {
  // Setup initial values
  const id = generateUUID()
  let timings: Timings = {}
  const customTimings: ViewCustomTimings = {}
  let documentVersion = 0
  let endTime: RelativeTime | undefined
  let location: Location = { ...initialLocation }
  let hasReplay = initialHasReplay

  lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { id, startTime, location, referrer })

  // Update the view every time the measures are changing
  const { throttled: scheduleViewUpdate, cancel: cancelScheduleViewUpdate } = throttle(
    monitor(triggerViewUpdate),
    THROTTLE_VIEW_UPDATE_PERIOD,
    {
      leading: false,
    }
  )

  const { setLoadEvent, stop: stopViewMetricsTracking, viewMetrics } = trackViewMetrics(
    lifeCycle,
    scheduleViewUpdate,
    loadingType
  )

  // Initial view update
  triggerViewUpdate()

  function triggerViewUpdate() {
    documentVersion += 1
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
      ...viewMetrics,
      customTimings,
      documentVersion,
      id,
      name,
      loadingType,
      location,
      hasReplay,
      referrer,
      startTime,
      timings,
      duration: elapsed(startTime, endTime === undefined ? relativeNow() : endTime),
      isActive: endTime === undefined,
    })
  }

  return {
    scheduleUpdate: scheduleViewUpdate,
    end() {
      endTime = relativeNow()
      stopViewMetricsTracking()
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED)
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
    addTiming(name: string, endTime: RelativeTime) {
      customTimings[sanitizeTiming(name)] = elapsed(startTime, endTime)
    },
    updateLocation(newLocation: Location) {
      location = { ...newLocation }
    },
    updateHasReplay(newHasReplay: boolean) {
      hasReplay = newHasReplay
    },
    get url() {
      return location.href
    },
  }
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

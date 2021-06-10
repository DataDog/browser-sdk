import {
  Duration,
  elapsed,
  generateUUID,
  monitor,
  ONE_MINUTE,
  throttle,
  ClocksState,
  clocksNow,
  clocksOrigin,
  timeStampNow,
  TimeStamp,
  display,
} from '@datadog/browser-core'
import { DOMMutationObservable } from '../../../browser/domMutationObservable'
import { ViewLoadingType, ViewCustomTimings } from '../../../rawRumEvent.types'

import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { EventCounts } from '../../trackEventCounts'
import { Timings, trackInitialViewTimings } from './trackInitialViewTimings'
import { trackLocationChanges, areDifferentLocation } from './trackLocationChanges'
import { trackViewMetrics } from './trackViewMetrics'

export interface ViewEvent {
  id: string
  name?: string
  location: Readonly<Location>
  referrer: string
  timings: Timings
  customTimings: ViewCustomTimings
  eventCounts: EventCounts
  documentVersion: number
  startClocks: ClocksState
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
  startClocks: ClocksState
}

export interface ViewEndedEvent {
  endClocks: ClocksState
}

export const THROTTLE_VIEW_UPDATE_PERIOD = 3000
export const SESSION_KEEP_ALIVE_INTERVAL = 5 * ONE_MINUTE

export function trackViews(
  location: Location,
  lifeCycle: LifeCycle,
  domMutationObservable: DOMMutationObservable,
  areViewsTrackedAutomatically: boolean,
  initialViewName?: string
) {
  let isRecording = false

  const { stop: stopInitialViewTracking, initialView } = trackInitialView(initialViewName)
  let currentView = initialView

  const { stop: stopViewLifeCycle } = startViewLifeCycle()
  const { stop: stopViewCollectionMode } = areViewsTrackedAutomatically
    ? startAutomaticViewCollection()
    : startManualViewCollection()

  function trackInitialView(name?: string) {
    const initialView = newView(
      lifeCycle,
      domMutationObservable,
      location,
      isRecording,
      ViewLoadingType.INITIAL_LOAD,
      document.referrer,
      clocksOrigin(),
      name
    )
    const { stop } = trackInitialViewTimings(lifeCycle, (timings) => {
      initialView.updateTimings(timings)
      initialView.scheduleUpdate()
    })
    return { initialView, stop }
  }

  function trackViewChange(startClocks?: ClocksState, name?: string) {
    return newView(
      lifeCycle,
      domMutationObservable,
      location,
      isRecording,
      ViewLoadingType.ROUTE_CHANGE,
      currentView.url,
      startClocks,
      name
    )
  }

  function startViewLifeCycle() {
    lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
      // do not trigger view update to avoid wrong data
      currentView.end()
      // Renew view on session renewal
      currentView = trackViewChange(undefined, currentView.name)
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

    return {
      stop: () => {
        clearInterval(keepAliveInterval)
      },
    }
  }

  function startAutomaticViewCollection() {
    return trackLocationChanges(() => {
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
  }

  function startManualViewCollection() {
    return trackLocationChanges(() => {
      currentView.updateLocation(location)
      currentView.triggerUpdate()
    })
  }

  return {
    addTiming: (name: string, time = timeStampNow()) => {
      currentView.addTiming(name, time)
      currentView.triggerUpdate()
    },
    startView: (name?: string, startClocks?: ClocksState) => {
      currentView.end(startClocks)
      currentView.triggerUpdate()
      currentView = trackViewChange(startClocks, name)
    },
    stop: () => {
      stopViewCollectionMode()
      stopInitialViewTracking()
      stopViewLifeCycle()
      currentView.end()
    },
  }
}

function newView(
  lifeCycle: LifeCycle,
  domMutationObservable: DOMMutationObservable,
  initialLocation: Location,
  initialHasReplay: boolean,
  loadingType: ViewLoadingType,
  referrer: string,
  startClocks: ClocksState = clocksNow(),
  name?: string
) {
  // Setup initial values
  const id = generateUUID()
  let timings: Timings = {}
  const customTimings: ViewCustomTimings = {}
  let documentVersion = 0
  let endClocks: ClocksState | undefined
  let location = { ...initialLocation }
  let hasReplay = initialHasReplay

  lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { id, name, startClocks, location, referrer })

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
    domMutationObservable,
    scheduleViewUpdate,
    loadingType
  )

  // Initial view update
  triggerViewUpdate()

  function triggerViewUpdate() {
    documentVersion += 1
    const currentEnd = endClocks === undefined ? timeStampNow() : endClocks.timeStamp
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
      startClocks,
      timings,
      duration: elapsed(startClocks.timeStamp, currentEnd),
      isActive: endClocks === undefined,
    })
  }

  return {
    name,
    scheduleUpdate: scheduleViewUpdate,
    end(clocks = clocksNow()) {
      endClocks = clocks
      stopViewMetricsTracking()
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, { endClocks })
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
    addTiming(name: string, time: TimeStamp) {
      customTimings[sanitizeTiming(name)] = elapsed(startClocks.timeStamp, time)
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
    display.warn(`Invalid timing name: ${name}, sanitized to: ${sanitized}`)
  }
  return sanitized
}

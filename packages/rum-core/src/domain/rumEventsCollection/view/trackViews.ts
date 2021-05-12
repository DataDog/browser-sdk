import {
  Duration,
  elapsed,
  generateUUID,
  monitor,
  ONE_MINUTE,
  throttle,
  Configuration,
  ClocksState,
  clocksNow,
  PreferredTime,
  preferredClock,
  clocksOrigin,
  noop,
} from '@datadog/browser-core'

import { ViewLoadingType, ViewCustomTimings } from '../../../rawRumEvent.types'

import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { EventCounts } from '../../trackEventCounts'
import { Timings, trackInitialViewTimings } from './trackInitialViewTimings'
import { trackLocationChanges, areDifferentLocation } from './trackLocationChanges'
import { trackViewMetrics } from './trackViewMetrics'
import { trackViewFocus, FocusPeriod } from './trackViewFocus'

export interface ViewEvent {
  id: string
  name?: string
  location: Location
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
  inForegroundPeriods?: FocusPeriod[]
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

export function trackViews(location: Location, lifeCycle: LifeCycle, configuration: Configuration) {
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
    const initialView = newView(
      lifeCycle,
      location,
      isRecording,
      ViewLoadingType.INITIAL_LOAD,
      document.referrer,
      configuration,
      clocksOrigin()
    )
    const { stop } = trackInitialViewTimings(lifeCycle, (timings) => {
      initialView.updateTimings(timings)
      initialView.scheduleUpdate()
    })
    return { initialView, stop }
  }

  function trackViewChange() {
    return newView(lifeCycle, location, isRecording, ViewLoadingType.ROUTE_CHANGE, currentView.url, configuration)
  }

  return {
    addTiming: (name: string, endClocks = clocksNow()) => {
      currentView.addTiming(name, endClocks)
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
  configuration: Configuration,
  startClocks: ClocksState = clocksNow(),
  name?: string
) {
  // Setup initial values
  const id = generateUUID()
  let timings: Timings = {}
  const customTimings: ViewCustomTimings = {}
  let documentVersion = 0
  let endClocks: ClocksState | undefined
  let location: Location = { ...initialLocation }
  let hasReplay = initialHasReplay
  lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { id, startClocks, location, referrer })

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

  let stopViewFocusTracking: () => void = noop
  let viewFocus: Partial<ViewEvent> = {}
  let updateCurrentFocusDuration: (endTime: PreferredTime) => void = noop

  if (configuration.isEnabled('track-focus')) {
    ;({ stop: stopViewFocusTracking, viewFocus, updateCurrentFocusDuration } = trackViewFocus(
      startClocks,
      scheduleViewUpdate
    ))
  }
  // Initial view update
  triggerViewUpdate()

  function triggerViewUpdate() {
    documentVersion += 1
    const currentEndClock = endClocks === undefined ? clocksNow() : endClocks
    updateCurrentFocusDuration(preferredClock(currentEndClock))
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
      ...viewMetrics,
      ...viewFocus,
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
      duration: elapsed(preferredClock(startClocks), preferredClock(currentEndClock)),
      isActive: endClocks === undefined,
    })
  }

  return {
    scheduleUpdate: scheduleViewUpdate,
    end() {
      endClocks = clocksNow()
      stopViewMetricsTracking()
      stopViewFocusTracking()
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
    addTiming(name: string, endClocks: ClocksState) {
      customTimings[sanitizeTiming(name)] = elapsed(preferredClock(startClocks), preferredClock(endClocks))
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

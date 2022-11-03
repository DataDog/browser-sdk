import type { Duration, ClocksState, TimeStamp, Observable, Subscription, RelativeTime } from '@datadog/browser-core'
import {
  PageExitReason,
  shallowClone,
  assign,
  elapsed,
  generateUUID,
  monitor,
  ONE_MINUTE,
  throttle,
  clocksNow,
  clocksOrigin,
  timeStampNow,
  display,
  looksLikeRelativeTime,
} from '@datadog/browser-core'

import type { ViewCustomTimings } from '../../../rawRumEvent.types'
import { ViewLoadingType } from '../../../rawRumEvent.types'

import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import type { EventCounts } from '../../trackEventCounts'
import type { LocationChange } from '../../../browser/locationChangeObservable'
import type { RumConfiguration } from '../../configuration'
import type { Timings } from './trackInitialViewTimings'
import { trackInitialViewTimings } from './trackInitialViewTimings'
import { trackViewMetrics } from './trackViewMetrics'

export interface ViewEvent {
  id: string
  name?: string
  service?: string
  version?: string
  location: Readonly<Location>
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
}

export interface ViewCreatedEvent {
  id: string
  name?: string
  service?: string
  version?: string
  startClocks: ClocksState
}

export interface ViewEndedEvent {
  endClocks: ClocksState
}

export const THROTTLE_VIEW_UPDATE_PERIOD = 3000
export const SESSION_KEEP_ALIVE_INTERVAL = 5 * ONE_MINUTE

export interface ViewOptions {
  name?: string
  service?: string
  version?: string
}

export function trackViews(
  location: Location,
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  configuration: RumConfiguration,
  locationChangeObservable: Observable<LocationChange>,
  areViewsTrackedAutomatically: boolean,
  initialViewOptions?: ViewOptions
) {
  const { stop: stopInitialViewTracking, initialView } = trackInitialView(initialViewOptions)
  let currentView = initialView

  const { stop: stopViewLifeCycle } = startViewLifeCycle()

  let locationChangeSubscription: Subscription
  if (areViewsTrackedAutomatically) {
    locationChangeSubscription = renewViewOnLocationChange(locationChangeObservable)
  }

  function trackInitialView(options?: ViewOptions) {
    const initialView = newView(
      lifeCycle,
      domMutationObservable,
      configuration,
      location,
      ViewLoadingType.INITIAL_LOAD,
      clocksOrigin(),
      options
    )
    const { stop } = trackInitialViewTimings(lifeCycle, (timings) => {
      initialView.updateTimings(timings)
      initialView.scheduleUpdate()
    })
    return { initialView, stop }
  }

  function trackViewChange(startClocks?: ClocksState, viewOptions?: ViewOptions) {
    return newView(
      lifeCycle,
      domMutationObservable,
      configuration,
      location,
      ViewLoadingType.ROUTE_CHANGE,
      startClocks,
      viewOptions
    )
  }

  function startViewLifeCycle() {
    lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
      // do not trigger view update to avoid wrong data
      currentView.end()
      // Renew view on session renewal
      currentView = trackViewChange(undefined, {
        name: currentView.name,
        service: currentView.service,
        version: currentView.version,
      })
    })

    // End the current view on page unload
    lifeCycle.subscribe(LifeCycleEventType.PAGE_EXITED, (pageExitEvent) => {
      if (pageExitEvent.reason === PageExitReason.UNLOADING) {
        currentView.end()
        currentView.triggerUpdate()
      }
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

  function renewViewOnLocationChange(locationChangeObservable: Observable<LocationChange>) {
    return locationChangeObservable.subscribe(({ oldLocation, newLocation }) => {
      if (areDifferentLocation(oldLocation, newLocation)) {
        currentView.end()
        currentView.triggerUpdate()
        currentView = trackViewChange()
        return
      }
    })
  }

  return {
    addTiming: (name: string, time: RelativeTime | TimeStamp = timeStampNow()) => {
      currentView.addTiming(name, time)
      currentView.scheduleUpdate()
    },
    startView: (options?: ViewOptions, startClocks?: ClocksState) => {
      currentView.end(startClocks)
      currentView.triggerUpdate()
      currentView = trackViewChange(startClocks, options)
    },
    stop: () => {
      locationChangeSubscription?.unsubscribe()
      stopInitialViewTracking()
      stopViewLifeCycle()
      currentView.end()
    },
  }
}

function newView(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  configuration: RumConfiguration,
  initialLocation: Location,
  loadingType: ViewLoadingType,
  startClocks: ClocksState = clocksNow(),
  viewOptions?: ViewOptions
) {
  // Setup initial values
  const id = generateUUID()
  let timings: Timings = {}
  const customTimings: ViewCustomTimings = {}
  let documentVersion = 0
  let endClocks: ClocksState | undefined
  const location = shallowClone(initialLocation)

  let name: string | undefined
  let service: string | undefined
  let version: string | undefined
  if (viewOptions) {
    name = viewOptions.name
    service = viewOptions.service
    version = viewOptions.version
  }

  lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { id, name, startClocks, service, version })

  // Update the view every time the measures are changing
  const { throttled: scheduleViewUpdate, cancel: cancelScheduleViewUpdate } = throttle(
    monitor(triggerViewUpdate),
    THROTTLE_VIEW_UPDATE_PERIOD,
    {
      leading: false,
    }
  )

  const {
    setLoadEvent,
    stop: stopViewMetricsTracking,
    viewMetrics,
  } = trackViewMetrics(lifeCycle, domMutationObservable, configuration, scheduleViewUpdate, loadingType, startClocks)

  // Initial view update
  triggerViewUpdate()

  function triggerViewUpdate() {
    documentVersion += 1
    const currentEnd = endClocks === undefined ? timeStampNow() : endClocks.timeStamp
    lifeCycle.notify(
      LifeCycleEventType.VIEW_UPDATED,
      assign(
        {
          customTimings,
          documentVersion,
          id,
          name,
          service,
          version,
          loadingType,
          location,
          startClocks,
          timings,
          duration: elapsed(startClocks.timeStamp, currentEnd),
          isActive: endClocks === undefined,
        },
        viewMetrics
      )
    )
  }

  return {
    name,
    service,
    version,
    scheduleUpdate: scheduleViewUpdate,
    end(clocks = clocksNow()) {
      endClocks = clocks
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, { endClocks })
      stopViewMetricsTracking()
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
    addTiming(name: string, time: RelativeTime | TimeStamp) {
      const relativeTime = looksLikeRelativeTime(time) ? time : elapsed(startClocks.timeStamp, time)
      customTimings[sanitizeTiming(name)] = relativeTime
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

function areDifferentLocation(currentLocation: Location, otherLocation: Location) {
  return (
    currentLocation.pathname !== otherLocation.pathname ||
    (!isHashAnAnchor(otherLocation.hash) &&
      getPathFromHash(otherLocation.hash) !== getPathFromHash(currentLocation.hash))
  )
}

function isHashAnAnchor(hash: string) {
  const correspondingId = hash.substr(1)
  return !!document.getElementById(correspondingId)
}

function getPathFromHash(hash: string) {
  const index = hash.indexOf('?')
  return index < 0 ? hash : hash.slice(0, index)
}

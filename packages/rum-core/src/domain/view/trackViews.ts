import type { Duration, ClocksState, TimeStamp, Subscription, RelativeTime } from '@datadog/browser-core'
import {
  noop,
  PageExitReason,
  shallowClone,
  elapsed,
  generateUUID,
  ONE_MINUTE,
  throttle,
  clocksNow,
  clocksOrigin,
  timeStampNow,
  display,
  looksLikeRelativeTime,
  setInterval,
  clearInterval,
  setTimeout,
  Observable,
} from '@datadog/browser-core'

import type { ViewCustomTimings } from '../../rawRumEvent.types'
import { ViewLoadingType } from '../../rawRumEvent.types'

import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { EventCounts } from '../trackEventCounts'
import type { LocationChange } from '../../browser/locationChangeObservable'
import type { RumConfiguration, RumInitConfiguration } from '../configuration'
import { trackViewEventCounts } from './trackViewEventCounts'
import { trackInitialViewMetrics } from './viewMetrics/trackInitialViewMetrics'
import type { InitialViewMetrics } from './viewMetrics/trackInitialViewMetrics'
import type { CommonViewMetrics } from './viewMetrics/trackCommonViewMetrics'
import { trackCommonViewMetrics } from './viewMetrics/trackCommonViewMetrics'

export interface ViewEvent {
  id: string
  name?: string
  service?: string
  version?: string
  location: Readonly<Location>
  commonViewMetrics: CommonViewMetrics
  initialViewMetrics: InitialViewMetrics
  customTimings: ViewCustomTimings
  eventCounts: EventCounts
  documentVersion: number
  startClocks: ClocksState
  duration: Duration
  isActive: boolean
  sessionIsActive: boolean
  loadingType: ViewLoadingType
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

// Some events or metrics can be captured after the end of the view. To avoid missing those;
// an arbitrary delay is added for stopping their tracking after the view ends.
//
// Ideally, we would not stop and keep tracking events or metrics until the end of the session.
// But this might have a small performance impact if there are many many views.
// So let's have a fairly short delay improving the situation in most cases and avoid impacting performances too much.
export const KEEP_TRACKING_AFTER_VIEW_DELAY = 5 * ONE_MINUTE

export interface ViewOptions {
  name?: string
  service?: RumInitConfiguration['service']
  version?: RumInitConfiguration['version']
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
  const activeViews: Set<ReturnType<typeof newView>> = new Set()
  let currentView = startNewView(ViewLoadingType.INITIAL_LOAD, clocksOrigin(), initialViewOptions)

  startViewLifeCycle()

  let locationChangeSubscription: Subscription
  if (areViewsTrackedAutomatically) {
    locationChangeSubscription = renewViewOnLocationChange(locationChangeObservable)
  }

  function startNewView(loadingType: ViewLoadingType, startClocks?: ClocksState, viewOptions?: ViewOptions) {
    const newlyCreatedView = newView(
      lifeCycle,
      domMutationObservable,
      configuration,
      location,
      loadingType,
      startClocks,
      viewOptions
    )
    activeViews.add(newlyCreatedView)
    newlyCreatedView.stopObservable.subscribe(() => {
      activeViews.delete(newlyCreatedView)
    })
    return newlyCreatedView
  }

  function startViewLifeCycle() {
    lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
      // Renew view on session renewal
      currentView = startNewView(ViewLoadingType.ROUTE_CHANGE, undefined, {
        name: currentView.name,
        service: currentView.service,
        version: currentView.version,
      })
    })

    lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, () => {
      currentView.end({ sessionIsActive: false })
    })

    // End the current view on page unload
    lifeCycle.subscribe(LifeCycleEventType.PAGE_EXITED, (pageExitEvent) => {
      if (pageExitEvent.reason === PageExitReason.UNLOADING) {
        currentView.end()
      }
    })
  }

  function renewViewOnLocationChange(locationChangeObservable: Observable<LocationChange>) {
    return locationChangeObservable.subscribe(({ oldLocation, newLocation }) => {
      if (areDifferentLocation(oldLocation, newLocation)) {
        currentView.end()
        currentView = startNewView(ViewLoadingType.ROUTE_CHANGE)
      }
    })
  }

  return {
    addTiming: (name: string, time: RelativeTime | TimeStamp = timeStampNow()) => {
      currentView.addTiming(name, time)
    },
    startView: (options?: ViewOptions, startClocks?: ClocksState) => {
      currentView.end({ endClocks: startClocks })
      currentView = startNewView(ViewLoadingType.ROUTE_CHANGE, startClocks, options)
    },
    stop: () => {
      locationChangeSubscription?.unsubscribe()
      currentView.end()
      activeViews.forEach((view) => view.stop())
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
  const stopObservable = new Observable<void>()
  const customTimings: ViewCustomTimings = {}
  let documentVersion = 0
  let endClocks: ClocksState | undefined
  const location = shallowClone(initialLocation)

  let sessionIsActive = true
  let name: string | undefined
  let service: string | undefined
  let version: string | undefined
  if (viewOptions) {
    name = viewOptions.name
    service = viewOptions.service || undefined
    version = viewOptions.version || undefined
  }

  const viewCreatedEvent = {
    id,
    name,
    startClocks,
    service,
    version,
  }
  lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, viewCreatedEvent)
  lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, viewCreatedEvent)

  // Update the view every time the measures are changing
  const { throttled: scheduleViewUpdate, cancel: cancelScheduleViewUpdate } = throttle(
    triggerViewUpdate,
    THROTTLE_VIEW_UPDATE_PERIOD,
    {
      leading: false,
    }
  )

  const {
    setLoadEvent,
    setViewEnd,
    stop: stopCommonViewMetricsTracking,
    stopINPTracking,
    getCommonViewMetrics,
  } = trackCommonViewMetrics(
    lifeCycle,
    domMutationObservable,
    configuration,
    scheduleViewUpdate,
    loadingType,
    startClocks
  )

  const { stop: stopInitialViewMetricsTracking, initialViewMetrics } =
    loadingType === ViewLoadingType.INITIAL_LOAD
      ? trackInitialViewMetrics(lifeCycle, configuration, setLoadEvent, scheduleViewUpdate)
      : { stop: noop, initialViewMetrics: {} as InitialViewMetrics }

  const { stop: stopEventCountsTracking, eventCounts } = trackViewEventCounts(lifeCycle, id, scheduleViewUpdate)

  // Session keep alive
  const keepAliveIntervalId = setInterval(triggerViewUpdate, SESSION_KEEP_ALIVE_INTERVAL)

  // Initial view update
  triggerViewUpdate()

  function triggerViewUpdate() {
    cancelScheduleViewUpdate()
    documentVersion += 1
    const currentEnd = endClocks === undefined ? timeStampNow() : endClocks.timeStamp

    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
      customTimings,
      documentVersion,
      id,
      name,
      service,
      version,
      loadingType,
      location,
      startClocks,
      commonViewMetrics: getCommonViewMetrics(),
      initialViewMetrics,
      duration: elapsed(startClocks.timeStamp, currentEnd),
      isActive: endClocks === undefined,
      sessionIsActive,
      eventCounts,
    })
  }

  return {
    name,
    service,
    version,
    stopObservable,
    end(options: { endClocks?: ClocksState; sessionIsActive?: boolean } = {}) {
      if (endClocks) {
        // view already ended
        return
      }
      endClocks = options.endClocks ?? clocksNow()
      sessionIsActive = options.sessionIsActive ?? true

      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, { endClocks })
      lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, { endClocks })
      clearInterval(keepAliveIntervalId)
      setViewEnd(endClocks.relative)
      stopCommonViewMetricsTracking()
      triggerViewUpdate()
      setTimeout(() => {
        this.stop()
      }, KEEP_TRACKING_AFTER_VIEW_DELAY)
    },
    stop() {
      stopInitialViewMetricsTracking()
      stopEventCountsTracking()
      stopINPTracking()
      stopObservable.notify()
    },
    addTiming(name: string, time: RelativeTime | TimeStamp) {
      if (endClocks) {
        return
      }
      const relativeTime = looksLikeRelativeTime(time) ? time : elapsed(startClocks.timeStamp, time)
      customTimings[sanitizeTiming(name)] = relativeTime
      scheduleViewUpdate()
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
  const correspondingId = hash.substring(1)
  // check if the correspondingId is empty because on Firefox an empty string passed to getElementById() prints a consol warning
  return correspondingId !== '' && !!document.getElementById(correspondingId)
}

function getPathFromHash(hash: string) {
  const index = hash.indexOf('?')
  return index < 0 ? hash : hash.slice(0, index)
}

import type {
  Duration,
  ClocksState,
  TimeStamp,
  Subscription,
  RelativeTime,
  Context,
  ContextValue,
} from '@datadog/browser-core'
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
  createContextManager,
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
import { onBFCacheRestore } from './bfCacheSupport'
import { measureRestoredFCP, measureRestoredLCP, measureRestoredFID } from './viewMetrics/cwvPolyfill'

export interface ViewEvent {
  id: string
  name?: string
  service?: string
  version?: string
  context?: Context
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
  context?: Context
  startClocks: ClocksState
}

export interface BeforeViewUpdateEvent {
  id: string
  name?: string
  context?: Context
  startClocks: ClocksState
  sessionIsActive: boolean
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
  context?: Context
}

export function trackViews(
  location: Location,
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  windowOpenObservable: Observable<void>,
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

  if (configuration.trackBfcacheViews) {
    onBFCacheRestore((pageshowEvent) => {
      currentView.end()
      currentView = startNewView(ViewLoadingType.BF_CACHE)

      measureRestoredFCP(pageshowEvent, (fcp) => {
        currentView.initialViewMetrics.firstContentfulPaint = fcp
        measureRestoredLCP(pageshowEvent, (lcp) => {
          currentView.initialViewMetrics.largestContentfulPaint = { value: lcp as RelativeTime }
          measureRestoredFID(pageshowEvent, (fid) => {
            currentView.initialViewMetrics.firstInput = {
              delay: fid.delay,
              time: fid.time as RelativeTime,
              targetSelector: undefined,
            }
            currentView.scheduleViewUpdate()
          })
        })
      })
    })
  }

  function startNewView(loadingType: ViewLoadingType, startClocks?: ClocksState, viewOptions?: ViewOptions) {
    const newlyCreatedView = newView(
      lifeCycle,
      domMutationObservable,
      windowOpenObservable,
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
        context: currentView.contextManager.getContext(),
      })
    })

    lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, () => {
      currentView.end({ sessionIsActive: false })
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
    setViewContext: (context: Context) => {
      currentView.contextManager.setContext(context)
    },
    setViewContextProperty: (key: string, value: ContextValue) => {
      currentView.contextManager.setContextProperty(key, value)
    },
    setViewName: (name: string) => {
      currentView.setViewName(name)
    },
    getViewContext: () => currentView.contextManager.getContext(),

    stop: () => {
      if (locationChangeSubscription) {
        locationChangeSubscription.unsubscribe()
      }
      currentView.end()
      activeViews.forEach((view) => view.stop())
    },
  }
}

function newView(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  windowOpenObservable: Observable<void>,
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
  const contextManager = createContextManager()

  let sessionIsActive = true
  let name = viewOptions?.name
  const service = viewOptions?.service || configuration.service
  const version = viewOptions?.version || configuration.version
  const context = viewOptions?.context

  if (context) {
    contextManager.setContext(context)
  }

  const viewCreatedEvent = {
    id,
    name,
    startClocks,
    service,
    version,
    context,
  }
  lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, viewCreatedEvent)
  lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, viewCreatedEvent)

  // Update the view every time the measures are changing
  const { throttled, cancel: cancelScheduleViewUpdate } = throttle(triggerViewUpdate, THROTTLE_VIEW_UPDATE_PERIOD, {
    leading: false,
  })

  const {
    setLoadEvent,
    setViewEnd,
    stop: stopCommonViewMetricsTracking,
    stopINPTracking,
    getCommonViewMetrics,
  } = trackCommonViewMetrics(
    lifeCycle,
    domMutationObservable,
    windowOpenObservable,
    configuration,
    scheduleViewUpdate,
    loadingType,
    startClocks
  )

  const { stop: stopInitialViewMetricsTracking, initialViewMetrics } =
    loadingType === ViewLoadingType.INITIAL_LOAD
      ? trackInitialViewMetrics(configuration, setLoadEvent, scheduleViewUpdate)
      : { stop: noop, initialViewMetrics: {} as InitialViewMetrics }

  const { stop: stopEventCountsTracking, eventCounts } = trackViewEventCounts(lifeCycle, id, scheduleViewUpdate)

  // Session keep alive
  const keepAliveIntervalId = setInterval(triggerViewUpdate, SESSION_KEEP_ALIVE_INTERVAL)

  const pageMayExitSubscription = lifeCycle.subscribe(LifeCycleEventType.PAGE_MAY_EXIT, (pageMayExitEvent) => {
    if (pageMayExitEvent.reason === PageExitReason.UNLOADING) {
      triggerViewUpdate()
    }
  })

  // Initial view update
  triggerViewUpdate()

  // View context update should always be throttled
  contextManager.changeObservable.subscribe(scheduleViewUpdate)

  function triggerBeforeViewUpdate() {
    lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_UPDATED, {
      id,
      name,
      context: contextManager.getContext(),
      startClocks,
      sessionIsActive,
    })
  }

  function scheduleViewUpdate() {
    triggerBeforeViewUpdate()
    throttled()
  }

  function triggerViewUpdate() {
    cancelScheduleViewUpdate()
    triggerBeforeViewUpdate()

    documentVersion += 1
    const currentEnd = endClocks === undefined ? timeStampNow() : endClocks.timeStamp
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
      customTimings,
      documentVersion,
      id,
      name,
      service,
      version,
      context: contextManager.getContext(),
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
    get name() {
      return name
    },
    service,
    version,
    contextManager,
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
      pageMayExitSubscription.unsubscribe()
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
    setViewName(updatedName: string) {
      name = updatedName
      triggerViewUpdate()
    },
    scheduleViewUpdate,
    /**
     * we need InitialViewMetrics object so that bfCache logic can update it
     * with the restored cwv from the polyfill.
     */
    initialViewMetrics,
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

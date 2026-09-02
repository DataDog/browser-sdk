// PoC (phase 3a of the internal API plan, see /plan.md): trackViews ported to the RUM internal
// API, used by the phase 2 public API. Mirrors trackViews.ts (untouched, still used by the
// startRum pipeline), with these differences:
// * Views are created with `internalApi.startEvent` and updated with `handle.update()`: the raw
//   view event building from viewCollection's `processViewUpdate` moved here, minus what the
//   internal API owns (view.id, document versions, event counts) and what contexts assemble
//   (session, referrer, usr, ... — corner-cuts documented in /plan.md).
// * Session renewal / expiry come from `internalApi.notifications` instead of the LifeCycle.
// * No `trackViewEventCounts`: the internal API computes view counts.
// * `PREPARE_URGENT_FLUSH` (page unloading) comes from the transport batch instead of the
//   LifeCycle: the final view update is upserted in the batch before it flushes.
// * The LifeCycle passed to `trackCommonViewMetrics` is a private instance: request events
//   (REQUEST_STARTED/REQUEST_COMPLETED, used by waitPageActivityEnd) never flow through it in
//   this pipeline — a corner-cut of the phase 2 public API (no auto-instrumentation).

import {
  ONE_MINUTE,
  clocksNow,
  clocksOrigin,
  elapsed,
  isRelativeTime,
  relativeToClocks,
  timeStampNow,
  toServerDuration,
} from '@datadog/js-core/time'
import type { ClocksState, Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/js-core/time'
import type { Context, ContextValue, Subscription } from '@datadog/browser-core'
import {
  Observable,
  PageExitReason,
  clearInterval,
  createContextManager,
  display,
  getTimeZone,
  isEmptyObject,
  mapValues,
  mockable,
  noop,
  setInterval,
  setTimeout,
  shallowClone,
  throttle,
} from '@datadog/browser-core'
import type { ViewCustomTimings } from '../../rawRumEvent.types'
import { ViewLoadingType } from '../../rawRumEvent.types'
import { discardNegativeDuration } from '../discardNegativeDuration'
import type { LocationChange } from '../../browser/locationChangeObservable'
import type { RumMutationRecord } from '../../browser/domMutationObservable'
import type { RumConfiguration, RumInitConfiguration } from '../configuration'
import { LifeCycle } from '../lifeCycle'
import type { PartialBaseRumEvent, RumInternalApi } from '../internalApi/rumInternalApi.types'
import { onBFCacheRestore } from './bfCacheSupport'
import { computeViewPerformanceData } from './viewCollection'
import { trackCommonViewMetrics } from './viewMetrics/trackCommonViewMetrics'
import { trackInitialViewMetrics } from './viewMetrics/trackInitialViewMetrics'
import type { InitialViewMetrics } from './viewMetrics/trackInitialViewMetrics'
import { trackBfcacheMetrics } from './viewMetrics/trackBfcacheMetrics'

export const THROTTLE_VIEW_UPDATE_PERIOD = 3000
export const SESSION_KEEP_ALIVE_INTERVAL = 5 * ONE_MINUTE

// Some events or metrics can be captured after the end of the view. To avoid missing those, an
// arbitrary delay is added for stopping their tracking after the view ends. (Same constant and
// rationale as trackViews.)
export const KEEP_TRACKING_AFTER_VIEW_DELAY = 5 * ONE_MINUTE

export interface ViewOptions {
  name?: string
  service?: RumInitConfiguration['service']
  version?: RumInitConfiguration['version']
  context?: Context
  handlingStack?: string
  url?: string
}

export function trackViewsOnInternalApi(
  internalApi: RumInternalApi,
  prepareUrgentFlushObservable: Observable<PageExitReason>,
  domMutationObservable: Observable<RumMutationRecord[]>,
  windowOpenObservable: Observable<void>,
  configuration: RumConfiguration,
  locationChangeObservable: Observable<LocationChange>,
  areViewsTrackedAutomatically: boolean,
  initialViewOptions?: ViewOptions
) {
  const activeViews: Set<ReturnType<typeof newView>> = new Set()
  // Unlike trackViews (always started once the initial view options are known, thanks to the
  // preStartRum firstStartViewCall dance), this port may start before any view exists in manual
  // mode: the first public startView call creates the initial view.
  let currentView: ReturnType<typeof newView> | undefined = areViewsTrackedAutomatically
    ? startNewView(ViewLoadingType.INITIAL_LOAD, clocksOrigin(), initialViewOptions)
    : undefined
  let stopOnBFCacheRestore: (() => void) | undefined

  startViewLifeCycle()

  let locationChangeSubscription: Subscription
  if (areViewsTrackedAutomatically) {
    locationChangeSubscription = renewViewOnLocationChange(locationChangeObservable)
    stopOnBFCacheRestore = onBFCacheRestore((pageshowEvent) => {
      currentView?.end()
      const startClocks = relativeToClocks(pageshowEvent.timeStamp as RelativeTime)
      currentView = startNewView(ViewLoadingType.BF_CACHE, startClocks, undefined)
    })
  }

  function startNewView(loadingType: ViewLoadingType, startClocks?: ClocksState, viewOptions?: ViewOptions) {
    const newlyCreatedView = newView(
      internalApi,
      prepareUrgentFlushObservable,
      domMutationObservable,
      windowOpenObservable,
      configuration,
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
    const subscription = internalApi.notifications.subscribe((notification) => {
      if (notification.type === 'session_renewed') {
        currentView = startNewView(ViewLoadingType.SESSION_RENEWAL, undefined, currentView && {
          // Renew view on session renewal
          name: currentView.name,
          service: currentView.service,
          version: currentView.version,
          context: currentView.contextManager.getContext(),
        })
      } else if (notification.type === 'session_expired') {
        // The notification doesn't carry the session end clocks; use the current time, as the
        // startRum pipeline does when bridging the session manager observable to the LifeCycle.
        currentView?.end({ sessionIsActive: false, endClocks: clocksNow() })
      }
    })

    return () => subscription.unsubscribe()
  }

  function renewViewOnLocationChange(renewViewOnLocation: Observable<LocationChange>) {
    return renewViewOnLocation.subscribe(({ oldLocation, newLocation }) => {
      if (areDifferentLocation(oldLocation, newLocation)) {
        currentView?.end()
        currentView = startNewView(ViewLoadingType.ROUTE_CHANGE)
      }
    })
  }

  return {
    addTiming: (name: string, time: RelativeTime | TimeStamp = timeStampNow()) => {
      // In manual mode, calls before the first startView are dropped (the preStartRum buffer
      // used to replay them)
      currentView?.addTiming(name, time)
    },
    setLoadingTime: (callTimestamp?: TimeStamp) => currentView?.setLoadingTime(callTimestamp),
    startView: (options?: ViewOptions, startClocks?: ClocksState) => {
      currentView?.end({ endClocks: startClocks })
      currentView = startNewView(ViewLoadingType.ROUTE_CHANGE, startClocks, options)
    },
    setViewContext: (context: Context) => {
      currentView?.contextManager.setContext(context)
    },
    setViewContextProperty: (key: string, value: ContextValue) => {
      currentView?.contextManager.setContextProperty(key, value)
    },
    setViewName: (name: string) => {
      currentView?.setViewName(name)
    },
    getViewContext: () => currentView?.contextManager.getContext() ?? {},

    stop: () => {
      if (locationChangeSubscription) {
        locationChangeSubscription.unsubscribe()
      }
      if (stopOnBFCacheRestore) {
        stopOnBFCacheRestore()
      }
      currentView?.end()
      activeViews.forEach((view) => view.stop())
    },
  }
}

function newView(
  internalApi: RumInternalApi,
  prepareUrgentFlushObservable: Observable<PageExitReason>,
  domMutationObservable: Observable<RumMutationRecord[]>,
  windowOpenObservable: Observable<void>,
  configuration: RumConfiguration,
  loadingType: ViewLoadingType,
  startClocks: ClocksState = clocksNow(),
  viewOptions?: ViewOptions
) {
  // Setup initial values
  const stopObservable = new Observable<void>()
  const customTimings: ViewCustomTimings = {}
  let endClocks: ClocksState | undefined
  const location = shallowClone(mockable(window.location))
  const contextManager = createContextManager()

  let name = viewOptions?.name
  const service = viewOptions?.service || configuration.service
  const version = viewOptions?.version || configuration.version
  const context = viewOptions?.context
  const handlingStack = viewOptions?.handlingStack

  if (context) {
    contextManager.setContext(context)
  }

  // The view starts as a complete kickoff event: the internal API owns the id and stamps it on
  // the event, so history entries (and findEvents) expose it from the start. Views are sent
  // incrementally: each update assembles a new event version (`_dd.document_version` is owned by
  // the internal API), and stop() sends the final version (`view.is_active: false`).
  const handle = internalApi.startEvent(
    {
      type: 'view',
      view: { url: viewOptions?.url ?? location.href, name },
      service,
      version,
    },
    {
      startClocks,
      domainContext: {
        handlingStack,
        location,
      },
    }
  )

  // Update the view every time the measures are changing
  const { throttled, cancel: cancelScheduleViewUpdate } = throttle(triggerViewUpdate, THROTTLE_VIEW_UPDATE_PERIOD, {
    leading: false,
  })

  // The LifeCycle passed to the metrics tracking modules only serves waitPageActivityEnd's
  // REQUEST_STARTED / REQUEST_COMPLETED subscriptions, which never flow in this pipeline (no
  // auto-instrumentation). See the notes at the top of this file.
  const metricsLifeCycle = new LifeCycle()

  const {
    setLoadEvent,
    setViewEnd,
    stop: stopCommonViewMetricsTracking,
    stopINPTracking,
    getCommonViewMetrics,
    setLoadingTime,
  } = trackCommonViewMetrics(
    metricsLifeCycle,
    domMutationObservable,
    windowOpenObservable,
    configuration,
    scheduleViewUpdate,
    loadingType,
    startClocks
  )

  const { stop: stopInitialViewMetricsTracking, initialViewMetrics } =
    loadingType === ViewLoadingType.INITIAL_LOAD
      ? trackInitialViewMetrics(configuration, startClocks, setLoadEvent, scheduleViewUpdate)
      : { stop: noop, initialViewMetrics: {} as InitialViewMetrics }

  // Start BFCache-specific metrics when restoring from BFCache
  if (loadingType === ViewLoadingType.BF_CACHE) {
    trackBfcacheMetrics(startClocks, initialViewMetrics, scheduleViewUpdate)
  }

  // Session keep alive
  const keepAliveIntervalId = setInterval(triggerViewUpdate, SESSION_KEEP_ALIVE_INTERVAL)

  const pageMayExitSubscription = prepareUrgentFlushObservable.subscribe((reason) => {
    if (reason === PageExitReason.UNLOADING) {
      triggerViewUpdate()
    }
  })

  // Initial view update
  triggerViewUpdate()

  // View context update should always be throttled
  contextManager.changeObservable.subscribe(scheduleViewUpdate)

  function scheduleViewUpdate() {
    throttled()
  }

  function buildUpdateEvent(final: boolean): PartialBaseRumEvent<'view'> {
    const currentEnd = endClocks === undefined ? timeStampNow() : endClocks.timeStamp
    const commonViewMetrics = getCommonViewMetrics()
    const clsDevicePixelRatio = commonViewMetrics.cumulativeLayoutShift?.devicePixelRatio

    // The raw view event building from viewCollection's processViewUpdate, minus what the
    // internal API owns (view.id, document version, event counts) and what contexts assemble
    // (session, referrer, usr, ...). The fields the partial type can't express directly are
    // merged on the loosely typed view fields object first.
    const viewFields = {
      cumulative_layout_shift: commonViewMetrics.cumulativeLayoutShift?.value,
      cumulative_layout_shift_time: toServerDuration(commonViewMetrics.cumulativeLayoutShift?.time),
      cumulative_layout_shift_target_selector: commonViewMetrics.cumulativeLayoutShift?.targetSelector,
      first_byte: toServerDuration(initialViewMetrics.navigationTimings?.firstByte),
      dom_complete: toServerDuration(initialViewMetrics.navigationTimings?.domComplete),
      dom_content_loaded: toServerDuration(initialViewMetrics.navigationTimings?.domContentLoaded),
      dom_interactive: toServerDuration(initialViewMetrics.navigationTimings?.domInteractive),
      first_contentful_paint: toServerDuration(initialViewMetrics.firstContentfulPaint),
      interaction_to_next_paint: toServerDuration(commonViewMetrics.interactionToNextPaint?.value),
      interaction_to_next_paint_time: toServerDuration(commonViewMetrics.interactionToNextPaint?.time),
      interaction_to_next_paint_target_selector: commonViewMetrics.interactionToNextPaint?.targetSelector,
      largest_contentful_paint: toServerDuration(initialViewMetrics.largestContentfulPaint?.value),
      largest_contentful_paint_target_selector: initialViewMetrics.largestContentfulPaint?.targetSelector,
      load_event: toServerDuration(initialViewMetrics.navigationTimings?.loadEvent),
      loading_time: discardNegativeDuration(toServerDuration(commonViewMetrics.loadingTime)),
      loading_type: loadingType,
      time_spent: toServerDuration(elapsed(startClocks.timeStamp, currentEnd)),
      performance: computeViewPerformanceData(commonViewMetrics, initialViewMetrics),
      is_active: !final,
      name,
      custom_timings: isEmptyObject(customTimings)
        ? undefined
        : mapValues(customTimings, toServerDuration as (duration: Duration) => ServerDuration),
    }

    return {
      view: viewFields,
      display: commonViewMetrics.scroll
        ? {
            scroll: {
              max_depth: commonViewMetrics.scroll.maxDepth,
              max_depth_scroll_top: commonViewMetrics.scroll.maxDepthScrollTop,
              max_scroll_height: commonViewMetrics.scroll.maxScrollHeight,
              max_scroll_height_time: toServerDuration(commonViewMetrics.scroll.maxScrollHeightTime),
            },
          }
        : undefined,
      privacy: {
        replay_level: configuration.defaultPrivacyLevel,
      },
      device: {
        locale: navigator.language,
        locales: navigator.languages,
        time_zone: getTimeZone(),
      },
      context: contextManager.getContext(),
      _dd: {
        cls: clsDevicePixelRatio
          ? {
              device_pixel_ratio: clsDevicePixelRatio,
            }
          : undefined,
        configuration: {
          start_session_replay_recording_manually: configuration.startSessionReplayRecordingManually,
          remote_configuration_id: configuration.remoteConfigurationId,
        },
      },
    } as unknown as PartialBaseRumEvent<'view'>
    // Cast: some raw view fields (performance, device.locales) don't fit the kickoff Context
    // type exactly; they merge fine at runtime.
  }

  function triggerViewUpdate() {
    if (endClocks !== undefined) {
      // The final version was sent by stop(); the handle would throw on further updates.
      return
    }
    cancelScheduleViewUpdate()
    handle.update(buildUpdateEvent(false))
  }

  return {
    get name() {
      return name
    },
    service,
    version,
    contextManager,
    stopObservable,
    handle,
    end(options: { endClocks?: ClocksState; sessionIsActive?: boolean } = {}) {
      if (endClocks) {
        // view already ended
        return
      }
      endClocks = options.endClocks ?? clocksNow()

      clearInterval(keepAliveIntervalId)
      setViewEnd(endClocks.relative)
      stopCommonViewMetricsTracking()
      pageMayExitSubscription.unsubscribe()
      // The final version (is_active: false) is sent by stop(), and its end time is the view end
      // clocks: the internal API computes the event duration from them for history queries.
      handle.stop(buildUpdateEvent(true), { endClocks })
      setTimeout(() => {
        this.stop()
      }, KEEP_TRACKING_AFTER_VIEW_DELAY)
    },
    stop() {
      stopInitialViewMetricsTracking()
      stopINPTracking()
      stopObservable.notify()
    },
    addTiming(name: string, time: RelativeTime | TimeStamp) {
      if (endClocks) {
        return
      }
      const relativeTime = isRelativeTime(time) ? time : elapsed(startClocks.timeStamp, time)
      customTimings[sanitizeTiming(name)] = relativeTime
      scheduleViewUpdate()
    },
    setLoadingTime,
    setViewName(updatedName: string) {
      name = updatedName
      triggerViewUpdate()
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

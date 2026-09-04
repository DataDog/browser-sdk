// PoC v2 (plan-v2.md, phase C): trackViews does not own view events anymore — the internal API
// does (startEvent promotes the draft / supersedes the active view; expiry endings are owned by
// the API). trackViews is a metrics enricher:
// * it attaches per-view metrics on `event_started` (views) and schedules their cleanup on
//   `event_stopped`,
// * it drives the automatic view starts (initial view, location change, BFCache restore, session
//   renewal) through `internalApi.startEvent`,
// * it sends the freshest metrics before every view ending (the last-update slot: before a
//   superseding startEvent, and during the `session_expired` notify — the internal API assembles
//   the final version after it).
// View mutations from the public API (setViewName, view context, custom timings) ride the view
// event directly through the internal API current view handle — they are not trackViews' concern.
//
// Differences vs the v1 port (see /plan.md) it replaces:
// * No `newView` object, no current-view bookkeeping: metrics bundles are keyed by view id and
//   driven by the event notifications.
// * `is_active` / final `time_spent` are owned by the internal API (derived endings), and
//   `name` / `context` / `custom_timings` ride the event: the update payloads only carry metrics
//   and the static view fields.
// * Corner-cuts carried over from v1: the metrics modules' LifeCycle is a private instance
//   (REQUEST_STARTED / REQUEST_COMPLETED never flow through it — no auto-instrumentation), and
//   view context updates are no longer throttled (they assemble a version each).

import { ONE_MINUTE, elapsed, relativeNow, timeStampNow, toServerDuration } from '@datadog/js-core/time'
import type { ClocksState, TimeStamp } from '@datadog/js-core/time'
import type { Context, Observable } from '@datadog/browser-core'
import {
  PageExitReason,
  clearInterval,
  getTimeZone,
  mockable,
  noop,
  setInterval,
  setTimeout,
  shallowClone,
  throttle,
} from '@datadog/browser-core'
import type { ViewPerformanceData } from '../../rawRumEvent.types'
import { ViewLoadingType } from '../../rawRumEvent.types'
import { discardNegativeDuration } from '../discardNegativeDuration'
import type { LocationChange } from '../../browser/locationChangeObservable'
import type { RumMutationRecord } from '../../browser/domMutationObservable'
import type { RumConfiguration, RumInitConfiguration } from '../configuration'
import { LifeCycle } from '../lifeCycle'
import type { PartialBaseRumEvent, RumInternalApi } from '../internalApi/rumInternalApi.types'
import { onBFCacheRestore } from './bfCacheSupport'
import { trackCommonViewMetrics } from './viewMetrics/trackCommonViewMetrics'
import type { CommonViewMetrics } from './viewMetrics/trackCommonViewMetrics'
import { trackInitialViewMetrics } from './viewMetrics/trackInitialViewMetrics'
import type { InitialViewMetrics } from './viewMetrics/trackInitialViewMetrics'
import { trackBfcacheMetrics } from './viewMetrics/trackBfcacheMetrics'

export const THROTTLE_VIEW_UPDATE_PERIOD = 3000
export const SESSION_KEEP_ALIVE_INTERVAL = 5 * ONE_MINUTE

// Some events or metrics can be captured after the end of the view. To avoid missing those, an
// arbitrary delay is added for stopping their tracking after the view ends. (Same constant and
// rationale as the v1 trackViews.)
export const KEEP_TRACKING_AFTER_VIEW_DELAY = 5 * ONE_MINUTE

export interface ViewOptions {
  name?: string
  service?: RumInitConfiguration['service']
  version?: RumInitConfiguration['version']
  context?: Context
  handlingStack?: string
  url?: string
}

export function trackViews(
  internalApi: RumInternalApi,
  prepareUrgentFlushObservable: Observable<PageExitReason>,
  domMutationObservable: Observable<RumMutationRecord[]>,
  windowOpenObservable: Observable<void>,
  configuration: RumConfiguration,
  locationChangeObservable: Observable<LocationChange>,
  areViewsTrackedAutomatically: boolean
) {
  // The metrics bundles of the tracked (started) views, keyed by view id.
  const activeViews = new Map<string, ViewMetricsBundle>()
  let currentViewId: string | undefined
  let stopAutoTracking: (() => void) | undefined

  internalApi.notifications.subscribe((notification) => {
    switch (notification.type) {
      case 'event_started': {
        if (notification.eventType === 'view') {
          currentViewId = notification.eventId
          attachViewMetrics(
            notification.eventId,
            notification.baggage.startClocks,
            readViewLoadingType(notification.event)
          )
        }
        break
      }
      case 'event_stopped': {
        if (notification.event.type === 'view') {
          onViewEnded((notification.event as { view?: { id?: string } }).view?.id)
        }
        break
      }
      case 'session_renewed': {
        // Renew the view, carrying over its identity (the previous view was ended at expiry)
        const previousEvent = internalApi.currentView.current().event as {
          view?: { name?: string }
          service?: string
          version?: string
          context?: Context
        }
        internalApi.startEvent({
          type: 'view',
          view: {
            url: shallowClone(mockable(window.location)).href,
            name: previousEvent.view?.name,
            loading_type: ViewLoadingType.SESSION_RENEWAL,
          },
          service: previousEvent.service,
          version: previousEvent.version,
          context: previousEvent.context,
        })
        break
      }
      case 'session_expired': {
        // The expiry slot: send the freshest metrics during the notify — the internal API
        // assembles the final view version once it returns.
        activeViews.get(currentViewId as string)?.sendLastViewMetricsUpdate()
        break
      }
    }
  })

  if (areViewsTrackedAutomatically) {
    stopAutoTracking = startAutomaticViewTracking()
  }

  return {
    // The manual loading time is metrics state: routed here from the public API (no-op before
    // init: no metrics bundle exists yet — the old preStartRum replayed the call, corner-cut)
    setLoadingTime: (callTimestamp?: TimeStamp) => {
      activeViews.get(currentViewId as string)?.setLoadingTime(callTimestamp)
    },
    stop: () => {
      stopAutoTracking?.()
      activeViews.forEach((bundle) => {
        bundle.stopScheduling()
        bundle.stopMetrics()
      })
      activeViews.clear()
    },
  }

  //
  // Automatic view tracking (initial view, location change, BFCache)
  //

  function startAutomaticViewTracking() {
    // The initial view: starting it promotes the internal API draft (initial_load is stamped by
    // the API, start at the clock origin).
    startViewEvent(undefined)

    const locationChangeSubscription = locationChangeObservable.subscribe(({ oldLocation, newLocation }) => {
      if (areDifferentLocation(oldLocation, newLocation)) {
        activeViews.get(currentViewId as string)?.sendLastViewMetricsUpdate()
        startViewEvent(ViewLoadingType.ROUTE_CHANGE)
      }
    })
    const stopOnBFCacheRestore = onBFCacheRestore((_pageshowEvent) => {
      activeViews.get(currentViewId as string)?.sendLastViewMetricsUpdate()
      startViewEvent(ViewLoadingType.BF_CACHE)
    })
    return () => {
      locationChangeSubscription.unsubscribe()
      stopOnBFCacheRestore()
    }
  }

  // Start (or promote / supersede — the internal API decides) a view with a minimal kickoff:
  // url, service and version come from the configuration / location, the loading type from the
  // start context (undefined for the initial view: the internal API stamps initial_load).
  function startViewEvent(loadingType: ViewLoadingType | undefined) {
    internalApi.startEvent({
      type: 'view',
      view: {
        url: shallowClone(mockable(window.location)).href,
        loading_type: loadingType,
      },
      service: configuration.service,
      version: configuration.version,
    })
  }

  //
  // Per-view metrics
  //

  function attachViewMetrics(viewId: string, startClocks: ClocksState, loadingType: ViewLoadingType) {
    // The LifeCycle passed to the metrics tracking modules only serves waitPageActivityEnd's
    // REQUEST_STARTED / REQUEST_COMPLETED subscriptions, which never flow in this pipeline (no
    // auto-instrumentation — corner-cut carried over from v1, see the notes at the top).
    const metricsLifeCycle = new LifeCycle()
    const { throttled, cancel: cancelScheduleViewUpdate } = throttle(
      () => updateViewMetrics(viewId),
      THROTTLE_VIEW_UPDATE_PERIOD,
      { leading: false }
    )
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
      throttled,
      loadingType,
      startClocks
    )
    const { stop: stopInitialViewMetricsTracking, initialViewMetrics } =
      loadingType === ViewLoadingType.INITIAL_LOAD
        ? trackInitialViewMetrics(configuration, startClocks, setLoadEvent, throttled)
        : { stop: noop, initialViewMetrics: {} as InitialViewMetrics }
    if (loadingType === ViewLoadingType.BF_CACHE) {
      trackBfcacheMetrics(startClocks, initialViewMetrics, throttled)
    }

    // Session keep alive: keep emitting view versions while the view is active
    const keepAliveIntervalId = setInterval(() => updateViewMetrics(viewId), SESSION_KEEP_ALIVE_INTERVAL)
    // Final view update on page unloading, before the transport urgent flush
    const pageMayExitSubscription = prepareUrgentFlushObservable.subscribe((reason) => {
      if (reason === PageExitReason.UNLOADING) {
        updateViewMetrics(viewId)
      }
    })

    const bundle: ViewMetricsBundle = {
      viewId,
      startClocks,
      loadingType,
      sendLastViewMetricsUpdate: () => {
        cancelScheduleViewUpdate()
        updateViewMetrics(viewId)
      },
      setLoadingTime,
      stopScheduling: () => {
        cancelScheduleViewUpdate()
        clearInterval(keepAliveIntervalId)
        pageMayExitSubscription.unsubscribe()
        setViewEnd(relativeNow())
      },
      stopMetrics: () => {
        stopCommonViewMetricsTracking()
        stopInitialViewMetricsTracking()
        stopINPTracking()
      },
      getViewMetrics: () => ({
        commonViewMetrics: getCommonViewMetrics(),
        initialViewMetrics,
      }),
    }
    activeViews.set(viewId, bundle)
    // The kickoff version was already emitted by the internal API; send the first metrics update
    // right away, like the v1 initial triggerViewUpdate.
    updateViewMetrics(viewId)
  }

  function updateViewMetrics(viewId: string) {
    // The update goes through the internal API current view: it targets this view only (a
    // scheduled update of a superseded view is dropped; the supersede already assembled its
    // final version with the last-update slot).
    const currentEntry = internalApi.currentView.current()
    if ((currentEntry.event as { view?: { id?: string } }).view?.id !== viewId) {
      return
    }
    const bundle = activeViews.get(viewId)
    if (!bundle) {
      return
    }
    if (currentEntry.complete) {
      return
    }
    internalApi.currentView.update(buildViewMetricsUpdate(bundle))
  }

  // The view ended (superseded or expired — the internal API assembled the final version):
  // stop scheduling updates immediately, keep listening for late metrics for a while.
  function onViewEnded(endedViewId: string | undefined) {
    if (endedViewId === undefined) {
      return
    }
    const bundle = activeViews.get(endedViewId)
    if (!bundle) {
      return
    }
    bundle.stopScheduling()
    activeViews.delete(endedViewId)
    setTimeout(() => {
      bundle.stopMetrics()
    }, KEEP_TRACKING_AFTER_VIEW_DELAY)
    if (endedViewId === currentViewId) {
      currentViewId = undefined
    }
  }

  function buildViewMetricsUpdate(bundle: ViewMetricsBundle): PartialBaseRumEvent<'view'> {
    const { loadingType, startClocks } = bundle
    const { commonViewMetrics, initialViewMetrics } = bundle.getViewMetrics()
    const clsDevicePixelRatio = commonViewMetrics.cumulativeLayoutShift?.devicePixelRatio

    // The raw view metrics fields, minus what others own: the internal API owns is_active and
    // the final time_spent (derived endings), and the view identity (id, name), the public API
    // owns the view context and custom timings — they all ride the event already.
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
      // The progressive time_spent on intermediate versions; the final one is derived by the
      // internal API from the activity bounds (same value).
      time_spent: toServerDuration(elapsed(startClocks.timeStamp, timeStampNow())),
      performance: computeViewPerformanceData(commonViewMetrics, initialViewMetrics),
      device: {
        locale: navigator.language,
        locales: navigator.languages,
        time_zone: getTimeZone(),
      },
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
    } as unknown as PartialBaseRumEvent<'view'>
    // Cast: some raw view fields (performance, device.locales) don't fit the kickoff Context
    // type exactly; they merge fine at runtime.
  }
}

interface ViewMetricsBundle {
  viewId: string
  startClocks: ClocksState
  loadingType: ViewLoadingType
  // The freshest metrics update of the view (the last-update slot before a superseding
  // startEvent, and during the session_expired notify)
  sendLastViewMetricsUpdate: () => void
  setLoadingTime: (callTimestamp?: TimeStamp) => void
  // Called when the view ends: no more scheduled updates, but metrics keep listening for a while
  stopScheduling: () => void
  stopMetrics: () => void
  getViewMetrics: () => { commonViewMetrics: CommonViewMetrics; initialViewMetrics: InitialViewMetrics }
}

function readViewLoadingType(event: unknown): ViewLoadingType {
  const loadingType = (event as { view?: { loading_type?: ViewLoadingType } }).view?.loading_type
  return loadingType ?? ViewLoadingType.INITIAL_LOAD
}

// Moved from viewCollection.ts (deleted in v1): computes the `view.performance` sub-fields.
export function computeViewPerformanceData(
  { cumulativeLayoutShift, interactionToNextPaint }: CommonViewMetrics,
  { firstContentfulPaint, largestContentfulPaint }: InitialViewMetrics
): ViewPerformanceData {
  return {
    cls: cumulativeLayoutShift && {
      score: cumulativeLayoutShift.value,
      timestamp: toServerDuration(cumulativeLayoutShift.time),
      target_selector: cumulativeLayoutShift.targetSelector,
      previous_rect: cumulativeLayoutShift.previousRect,
      current_rect: cumulativeLayoutShift.currentRect,
    },
    fcp: firstContentfulPaint && { timestamp: toServerDuration(firstContentfulPaint) },
    inp: interactionToNextPaint && {
      duration: toServerDuration(interactionToNextPaint.value),
      timestamp: toServerDuration(interactionToNextPaint.time),
      target_selector: interactionToNextPaint.targetSelector,
      sub_parts: interactionToNextPaint.subParts
        ? {
            input_delay: toServerDuration(interactionToNextPaint.subParts.inputDelay),
            processing_duration: toServerDuration(interactionToNextPaint.subParts.processingDuration),
            presentation_delay: toServerDuration(interactionToNextPaint.subParts.presentationDelay),
          }
        : undefined,
    },
    lcp: largestContentfulPaint && {
      timestamp: toServerDuration(largestContentfulPaint.value),
      target_selector: largestContentfulPaint.targetSelector,
      resource_url: largestContentfulPaint.resourceUrl,
      sub_parts: largestContentfulPaint.subParts
        ? {
            load_delay: toServerDuration(largestContentfulPaint.subParts.loadDelay),
            load_time: toServerDuration(largestContentfulPaint.subParts.loadTime),
            render_delay: toServerDuration(largestContentfulPaint.subParts.renderDelay),
          }
        : undefined,
    },
  }
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

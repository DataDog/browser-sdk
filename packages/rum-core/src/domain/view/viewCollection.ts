import type { Duration, RelativeTime, ServerDuration, Observable } from '@datadog/browser-core'
import {
  ExperimentalFeature,
  getTimeZone,
  DISCARDED,
  HookNames,
  isEmptyObject,
  isExperimentalFeatureEnabled,
  mapValues,
  relativeNow,
  toServerDuration,
} from '@datadog/browser-core'
import { discardNegativeDuration } from '../discardNegativeDuration'
import type { RecorderApi } from '../../boot/rumPublicApi'
import type { RawRumViewEvent, RawRumViewUpdateEvent, ViewPerformanceData } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { LifeCycle, RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { LocationChange } from '../../browser/locationChangeObservable'
import type { RumConfiguration } from '../configuration'
import type { ViewHistory } from '../contexts/viewHistory'
import type { DefaultRumEventAttributes, DefaultTelemetryEventAttributes, Hooks } from '../hooks'
import type { RumMutationRecord } from '../../browser/domMutationObservable'
import { trackViews } from './trackViews'
import type { ViewEvent, ViewOptions } from './trackViews'
import type { CommonViewMetrics } from './viewMetrics/trackCommonViewMetrics'
import type { InitialViewMetrics } from './viewMetrics/trackInitialViewMetrics'

const FULL_VIEW_REFRESH_INTERVAL = 50 // Every 50 updates, send full VIEW (safety net)
const FULL_VIEW_REFRESH_TIME = 5 * 60_000 // Or every 5 minutes (aligned with session keep-alive)

interface ViewSnapshot {
  event: RawRumViewEvent
  updatesSinceLastFull: number
  lastFullViewTime: RelativeTime
}

export function startViewCollection(
  lifeCycle: LifeCycle,
  hooks: Hooks,
  configuration: RumConfiguration,
  domMutationObservable: Observable<RumMutationRecord[]>,
  pageOpenObservable: Observable<void>,
  locationChangeObservable: Observable<LocationChange>,
  recorderApi: RecorderApi,
  viewHistory: ViewHistory,
  initialViewOptions?: ViewOptions
) {
  const snapshotStore = new Map<string, ViewSnapshot>()

  const viewUpdatedSubscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) => {
    if (view.documentVersion === 1 || !isExperimentalFeatureEnabled(ExperimentalFeature.VIEW_UPDATE)) {
      const fullResult = processViewUpdate(view, configuration, recorderApi)
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, fullResult)

      // Store snapshot for diff baseline (only when VIEW_UPDATE feature is enabled)
      if (isExperimentalFeatureEnabled(ExperimentalFeature.VIEW_UPDATE)) {
        snapshotStore.set(view.id, {
          event: fullResult.rawRumEvent,
          updatesSinceLastFull: 0,
          lastFullViewTime: relativeNow(),
        })
      }
    } else {
      const snapshot = snapshotStore.get(view.id)
      const shouldSendFull =
        !snapshot ||
        !view.isActive || // always full on view end
        snapshot.updatesSinceLastFull >= FULL_VIEW_REFRESH_INTERVAL ||
        relativeNow() - snapshot.lastFullViewTime >= FULL_VIEW_REFRESH_TIME

      if (shouldSendFull) {
        const fullResult = processViewUpdate(view, configuration, recorderApi)
        lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, fullResult)
        snapshotStore.set(view.id, {
          event: fullResult.rawRumEvent,
          updatesSinceLastFull: 0,
          lastFullViewTime: relativeNow(),
        })
      } else {
        lifeCycle.notify(
          LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
          processViewDiff(view, snapshot, configuration, recorderApi)
        )
        // Update the snapshot event to the current state so the next diff has the latest baseline
        const updatedFullEvent = processViewUpdate(view, configuration, recorderApi).rawRumEvent
        snapshotStore.set(view.id, {
          event: updatedFullEvent,
          updatesSinceLastFull: snapshot.updatesSinceLastFull + 1,
          lastFullViewTime: snapshot.lastFullViewTime,
        })
      }

      if (!view.isActive) {
        snapshotStore.delete(view.id)
      }
    }
  })

  hooks.register(HookNames.Assemble, ({ startTime, eventType }): DefaultRumEventAttributes | DISCARDED => {
    const view = viewHistory.findView(startTime)

    if (!view) {
      return DISCARDED
    }

    return {
      type: eventType,
      service: view.service,
      version: view.version,
      context: view.context,
      view: {
        id: view.id,
        name: view.name,
      },
    }
  })

  hooks.register(
    HookNames.AssembleTelemetry,
    ({ startTime }): DefaultTelemetryEventAttributes => ({
      view: {
        id: viewHistory.findView(startTime)?.id,
      },
    })
  )

  const trackViewsResult = trackViews(
    lifeCycle,
    domMutationObservable,
    pageOpenObservable,
    configuration,
    locationChangeObservable,
    !configuration.trackViewsManually,
    initialViewOptions
  )

  return {
    ...trackViewsResult,
    stop: () => {
      viewUpdatedSubscription.unsubscribe()
      snapshotStore.clear()
      trackViewsResult.stop()
    },
  }
}

function processViewUpdate(
  view: ViewEvent,
  configuration: RumConfiguration,
  recorderApi: RecorderApi
): RawRumEventCollectedData<RawRumViewEvent> {
  const replayStats = recorderApi.getReplayStats(view.id)
  const clsDevicePixelRatio = view.commonViewMetrics?.cumulativeLayoutShift?.devicePixelRatio
  const viewEvent: RawRumViewEvent = {
    _dd: {
      document_version: view.documentVersion,
      replay_stats: replayStats,
      cls: clsDevicePixelRatio
        ? {
            device_pixel_ratio: clsDevicePixelRatio,
          }
        : undefined,
      configuration: {
        start_session_replay_recording_manually: configuration.startSessionReplayRecordingManually,
      },
    },
    date: view.startClocks.timeStamp,
    type: RumEventType.VIEW,
    view: {
      action: {
        count: view.eventCounts.actionCount,
      },
      frustration: {
        count: view.eventCounts.frustrationCount,
      },
      cumulative_layout_shift: view.commonViewMetrics.cumulativeLayoutShift?.value,
      cumulative_layout_shift_time: toServerDuration(view.commonViewMetrics.cumulativeLayoutShift?.time),
      cumulative_layout_shift_target_selector: view.commonViewMetrics.cumulativeLayoutShift?.targetSelector,
      first_byte: toServerDuration(view.initialViewMetrics.navigationTimings?.firstByte),
      dom_complete: toServerDuration(view.initialViewMetrics.navigationTimings?.domComplete),
      dom_content_loaded: toServerDuration(view.initialViewMetrics.navigationTimings?.domContentLoaded),
      dom_interactive: toServerDuration(view.initialViewMetrics.navigationTimings?.domInteractive),
      error: {
        count: view.eventCounts.errorCount,
      },
      first_contentful_paint: toServerDuration(view.initialViewMetrics.firstContentfulPaint),
      first_input_delay: toServerDuration(view.initialViewMetrics.firstInput?.delay),
      first_input_time: toServerDuration(view.initialViewMetrics.firstInput?.time),
      first_input_target_selector: view.initialViewMetrics.firstInput?.targetSelector,
      interaction_to_next_paint: toServerDuration(view.commonViewMetrics.interactionToNextPaint?.value),
      interaction_to_next_paint_time: toServerDuration(view.commonViewMetrics.interactionToNextPaint?.time),
      interaction_to_next_paint_target_selector: view.commonViewMetrics.interactionToNextPaint?.targetSelector,
      is_active: view.isActive,
      name: view.name,
      largest_contentful_paint: toServerDuration(view.initialViewMetrics.largestContentfulPaint?.value),
      largest_contentful_paint_target_selector: view.initialViewMetrics.largestContentfulPaint?.targetSelector,
      load_event: toServerDuration(view.initialViewMetrics.navigationTimings?.loadEvent),
      loading_time: discardNegativeDuration(toServerDuration(view.commonViewMetrics.loadingTime)),
      loading_type: view.loadingType,
      long_task: {
        count: view.eventCounts.longTaskCount,
      },
      performance: computeViewPerformanceData(view.commonViewMetrics, view.initialViewMetrics),
      resource: {
        count: view.eventCounts.resourceCount,
      },
      time_spent: toServerDuration(view.duration),
    },
    display: view.commonViewMetrics.scroll
      ? {
          scroll: {
            max_depth: view.commonViewMetrics.scroll.maxDepth,
            max_depth_scroll_top: view.commonViewMetrics.scroll.maxDepthScrollTop,
            max_scroll_height: view.commonViewMetrics.scroll.maxScrollHeight,
            max_scroll_height_time: toServerDuration(view.commonViewMetrics.scroll.maxScrollHeightTime),
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
  }

  if (!isEmptyObject(view.customTimings)) {
    viewEvent.view.custom_timings = mapValues(
      view.customTimings,
      toServerDuration as (duration: Duration) => ServerDuration
    )
  }

  return {
    rawRumEvent: viewEvent,
    startClocks: view.startClocks,
    duration: view.duration,
    domainContext: {
      location: view.location,
      handlingStack: view.handlingStack,
    },
  }
}

// Compile-time exhaustiveness guard for processViewDiff.
//
// Every field in RawRumViewUpdateEvent['view'] must appear in exactly one of:
//   - ALWAYS_PRESENT_VU_VIEW_FIELDS  — unconditionally included (e.g. time_spent)
//   - DIFFED_VU_VIEW_FIELDS          — included when changed (counters, vitals, timings)
//   - OMITTED_VU_VIEW_FIELDS         — intentionally excluded from VUs with reason
//
// If a new field is added to the schema without updating one of these types, the compiler
// will emit: "Type 'true' is not assignable to type 'never'" on the assertion below.
type AlwaysPresentVuViewFields = 'time_spent'
type DiffedVuViewFields =
  | 'error'
  | 'action'
  | 'long_task'
  | 'resource'
  | 'frustration'
  | 'loading_time'
  | 'cumulative_layout_shift'
  | 'cumulative_layout_shift_time'
  | 'cumulative_layout_shift_target_selector'
  | 'interaction_to_next_paint'
  | 'interaction_to_next_paint_time'
  | 'interaction_to_next_paint_target_selector'
  | 'first_contentful_paint'
  | 'first_input_delay'
  | 'first_input_time'
  | 'first_input_target_selector'
  | 'largest_contentful_paint'
  | 'largest_contentful_paint_target_selector'
  | 'dom_complete'
  | 'dom_content_loaded'
  | 'dom_interactive'
  | 'load_event'
  | 'first_byte'
  | 'custom_timings'
// Fields present in RawRumViewUpdateEvent['view'] but intentionally excluded from VUs:
type OmittedVuViewFields = 'performance' // redundant — each sub-metric is already sent as an individual flat field above
type _AssertVuViewFieldsCovered =
  Exclude<
    keyof RawRumViewUpdateEvent['view'],
    AlwaysPresentVuViewFields | DiffedVuViewFields | OmittedVuViewFields
  > extends never
    ? true
    : never
// If the line below has a type error, add the new field to one of the types above and handle it
// in processViewDiff (or add to OmittedVuViewFields with a comment explaining why).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _vuViewFieldsCoverage: _AssertVuViewFieldsCovered = true

function processViewDiff(
  view: ViewEvent,
  snapshot: ViewSnapshot,
  _configuration: RumConfiguration,
  recorderApi: RecorderApi
): RawRumEventCollectedData<RawRumViewUpdateEvent> {
  const prev = snapshot.event
  const replayStats = recorderApi.getReplayStats(view.id)

  // Always-required fields
  const viewUpdateEvent: RawRumViewUpdateEvent = {
    date: view.startClocks.timeStamp,
    type: RumEventType.VIEW_UPDATE,
    _dd: {
      document_version: view.documentVersion,
      replay_stats: JSON.stringify(replayStats) !== JSON.stringify(prev._dd.replay_stats) ? replayStats : undefined,
    },
    view: {
      // time_spent always changes — omitting it would make every VU ambiguous
      time_spent: toServerDuration(view.duration),
      // is_active omitted: VUs are only emitted for active views (view-end always sends a full VIEW)
    },
  }

  // Replay stats diff (already handled above, but also check for inclusion)
  if (JSON.stringify(replayStats) !== JSON.stringify(prev._dd.replay_stats)) {
    viewUpdateEvent._dd.replay_stats = replayStats
  }

  // Counter diffs
  const currentActionCount = view.eventCounts.actionCount
  if (currentActionCount !== prev.view.action.count) {
    viewUpdateEvent.view.action = { count: currentActionCount }
  }

  const currentErrorCount = view.eventCounts.errorCount
  if (currentErrorCount !== prev.view.error.count) {
    viewUpdateEvent.view.error = { count: currentErrorCount }
  }

  const currentLongTaskCount = view.eventCounts.longTaskCount
  if (currentLongTaskCount !== prev.view.long_task.count) {
    viewUpdateEvent.view.long_task = { count: currentLongTaskCount }
  }

  const currentResourceCount = view.eventCounts.resourceCount
  if (currentResourceCount !== prev.view.resource.count) {
    viewUpdateEvent.view.resource = { count: currentResourceCount }
  }

  const currentFrustrationCount = view.eventCounts.frustrationCount
  if (currentFrustrationCount !== prev.view.frustration.count) {
    viewUpdateEvent.view.frustration = { count: currentFrustrationCount }
  }

  // Web vitals / performance
  const currentLoadingTime = discardNegativeDuration(toServerDuration(view.commonViewMetrics.loadingTime))
  if (currentLoadingTime !== prev.view.loading_time) {
    viewUpdateEvent.view.loading_time = currentLoadingTime
  }

  const currentCLS = view.commonViewMetrics.cumulativeLayoutShift?.value
  if (currentCLS !== prev.view.cumulative_layout_shift) {
    viewUpdateEvent.view.cumulative_layout_shift = currentCLS
    viewUpdateEvent.view.cumulative_layout_shift_time = toServerDuration(
      view.commonViewMetrics.cumulativeLayoutShift?.time
    )
    viewUpdateEvent.view.cumulative_layout_shift_target_selector =
      view.commonViewMetrics.cumulativeLayoutShift?.targetSelector
  }

  const currentINP = toServerDuration(view.commonViewMetrics.interactionToNextPaint?.value)
  if (currentINP !== prev.view.interaction_to_next_paint) {
    viewUpdateEvent.view.interaction_to_next_paint = currentINP
    viewUpdateEvent.view.interaction_to_next_paint_time = toServerDuration(
      view.commonViewMetrics.interactionToNextPaint?.time
    )
    viewUpdateEvent.view.interaction_to_next_paint_target_selector =
      view.commonViewMetrics.interactionToNextPaint?.targetSelector
  }

  // Initial-load only metrics (they only set once — compare with snapshot)
  const currentFCP = toServerDuration(view.initialViewMetrics.firstContentfulPaint)
  if (currentFCP !== prev.view.first_contentful_paint) {
    viewUpdateEvent.view.first_contentful_paint = currentFCP
  }

  const currentFID = toServerDuration(view.initialViewMetrics.firstInput?.delay)
  if (currentFID !== prev.view.first_input_delay) {
    viewUpdateEvent.view.first_input_delay = currentFID
    viewUpdateEvent.view.first_input_time = toServerDuration(view.initialViewMetrics.firstInput?.time)
    viewUpdateEvent.view.first_input_target_selector = view.initialViewMetrics.firstInput?.targetSelector
  }

  const currentLCP = toServerDuration(view.initialViewMetrics.largestContentfulPaint?.value)
  if (currentLCP !== prev.view.largest_contentful_paint) {
    viewUpdateEvent.view.largest_contentful_paint = currentLCP
    viewUpdateEvent.view.largest_contentful_paint_target_selector =
      view.initialViewMetrics.largestContentfulPaint?.targetSelector
  }

  const currentFirstByte = toServerDuration(view.initialViewMetrics.navigationTimings?.firstByte)
  if (currentFirstByte !== prev.view.first_byte) {
    viewUpdateEvent.view.first_byte = currentFirstByte
  }

  const currentDomComplete = toServerDuration(view.initialViewMetrics.navigationTimings?.domComplete)
  if (currentDomComplete !== prev.view.dom_complete) {
    viewUpdateEvent.view.dom_complete = currentDomComplete
  }

  const currentDomContentLoaded = toServerDuration(view.initialViewMetrics.navigationTimings?.domContentLoaded)
  if (currentDomContentLoaded !== prev.view.dom_content_loaded) {
    viewUpdateEvent.view.dom_content_loaded = currentDomContentLoaded
  }

  const currentDomInteractive = toServerDuration(view.initialViewMetrics.navigationTimings?.domInteractive)
  if (currentDomInteractive !== prev.view.dom_interactive) {
    viewUpdateEvent.view.dom_interactive = currentDomInteractive
  }

  const currentLoadEvent = toServerDuration(view.initialViewMetrics.navigationTimings?.loadEvent)
  if (currentLoadEvent !== prev.view.load_event) {
    viewUpdateEvent.view.load_event = currentLoadEvent
  }

  // Scroll display — full replacement if any subfield changed.
  // Convert maxScrollHeightTime to ServerDuration before comparison — Duration (ms) vs ServerDuration (ns)
  // are not directly comparable; the snapshot stores ServerDuration from processViewUpdate.
  const currentScroll = view.commonViewMetrics.scroll
  const currentScrollNormalized = currentScroll
    ? {
        maxDepth: currentScroll.maxDepth,
        maxDepthScrollTop: currentScroll.maxDepthScrollTop,
        maxScrollHeight: currentScroll.maxScrollHeight,
        maxScrollHeightTime: toServerDuration(currentScroll.maxScrollHeightTime),
      }
    : undefined
  if (JSON.stringify(currentScrollNormalized) !== JSON.stringify(getPrevScroll(prev))) {
    viewUpdateEvent.display = currentScrollNormalized
      ? {
          scroll: {
            max_depth: currentScrollNormalized.maxDepth,
            max_depth_scroll_top: currentScrollNormalized.maxDepthScrollTop,
            max_scroll_height: currentScrollNormalized.maxScrollHeight,
            max_scroll_height_time: currentScrollNormalized.maxScrollHeightTime,
          },
        }
      : undefined
  }

  // Custom timings — REPLACE semantics: send full object if changed
  const currentCustomTimings = !isEmptyObject(view.customTimings)
    ? mapValues(view.customTimings, toServerDuration as (duration: Duration) => ServerDuration)
    : undefined
  if (JSON.stringify(currentCustomTimings) !== JSON.stringify(prev.view.custom_timings)) {
    viewUpdateEvent.view.custom_timings = currentCustomTimings
  }

  return {
    rawRumEvent: viewUpdateEvent,
    startClocks: view.startClocks,
    duration: view.duration,
    domainContext: {
      location: view.location,
      handlingStack: view.handlingStack,
    },
  }
}

function getPrevScroll(prev: RawRumViewEvent) {
  if (!prev.display?.scroll) {
    return undefined
  }
  // Reconstruct a comparable scroll object in the same shape as commonViewMetrics.scroll
  const s = prev.display.scroll
  return {
    maxDepth: s.max_depth,
    maxDepthScrollTop: s.max_depth_scroll_top,
    maxScrollHeight: s.max_scroll_height,
    maxScrollHeightTime: s.max_scroll_height_time,
  }
}

function computeViewPerformanceData(
  { cumulativeLayoutShift, interactionToNextPaint }: CommonViewMetrics,
  { firstContentfulPaint, firstInput, largestContentfulPaint }: InitialViewMetrics
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
    fid: firstInput && {
      duration: toServerDuration(firstInput.delay),
      timestamp: toServerDuration(firstInput.time),
      target_selector: firstInput.targetSelector,
    },
    inp: interactionToNextPaint && {
      duration: toServerDuration(interactionToNextPaint.value),
      timestamp: toServerDuration(interactionToNextPaint.time),
      target_selector: interactionToNextPaint.targetSelector,
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

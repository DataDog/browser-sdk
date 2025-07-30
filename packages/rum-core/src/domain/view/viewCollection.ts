import type { Duration, ServerDuration, Observable } from '@datadog/browser-core'
import { getTimeZone, DISCARDED, HookNames, isEmptyObject, mapValues, toServerDuration } from '@datadog/browser-core'
import { discardNegativeDuration } from '../discardNegativeDuration'
import type { RecorderApi } from '../../boot/rumPublicApi'
import type { RawRumViewEvent, ViewPerformanceData } from '../../rawRumEvent.types'
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

export function startViewCollection(
  lifeCycle: LifeCycle,
  hooks: Hooks,
  configuration: RumConfiguration,
  location: Location,
  domMutationObservable: Observable<RumMutationRecord[]>,
  pageOpenObservable: Observable<void>,
  locationChangeObservable: Observable<LocationChange>,
  recorderApi: RecorderApi,
  viewHistory: ViewHistory,
  initialViewOptions?: ViewOptions
) {
  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) =>
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processViewUpdate(view, configuration, recorderApi))
  )

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

  hooks.register(HookNames.AssembleTelemetry, ({ startTime }): DefaultTelemetryEventAttributes => {
    const foundView = viewHistory.findView(startTime)
    return {
      view: {
        id: foundView && foundView.id,
      },
    }
  })

  return trackViews(
    location,
    lifeCycle,
    domMutationObservable,
    pageOpenObservable,
    configuration,
    locationChangeObservable,
    !configuration.trackViewsManually,
    initialViewOptions
  )
}

function processViewUpdate(
  view: ViewEvent,
  configuration: RumConfiguration,
  recorderApi: RecorderApi
): RawRumEventCollectedData<RawRumViewEvent> {
  const replayStats = recorderApi.getReplayStats(view.id)
  const cls = view.commonViewMetrics.cumulativeLayoutShift
  const inp = view.commonViewMetrics.interactionToNextPaint
  const firstInput = view.initialViewMetrics.firstInput
  const lcp = view.initialViewMetrics.largestContentfulPaint
  const navTimings = view.initialViewMetrics.navigationTimings
  const clsDevicePixelRatio = cls && cls.devicePixelRatio

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
      cumulative_layout_shift: cls && cls.value,
      cumulative_layout_shift_time: toServerDuration(cls && cls.time),
      cumulative_layout_shift_target_selector: cls && cls.targetSelector,
      first_byte: toServerDuration(navTimings && navTimings.firstByte),
      dom_complete: toServerDuration(navTimings && navTimings.domComplete),
      dom_content_loaded: toServerDuration(navTimings && navTimings.domContentLoaded),
      dom_interactive: toServerDuration(navTimings && navTimings.domInteractive),
      error: {
        count: view.eventCounts.errorCount,
      },
      first_contentful_paint: toServerDuration(view.initialViewMetrics.firstContentfulPaint),
      first_input_delay: toServerDuration(firstInput && firstInput.delay),
      first_input_time: toServerDuration(firstInput && firstInput.time),
      first_input_target_selector: firstInput && firstInput.targetSelector,
      interaction_to_next_paint: toServerDuration(inp && inp.value),
      interaction_to_next_paint_time: toServerDuration(inp && inp.time),
      interaction_to_next_paint_target_selector: inp && inp.targetSelector,
      is_active: view.isActive,
      name: view.name,
      largest_contentful_paint: toServerDuration(lcp && lcp.value),
      largest_contentful_paint_target_selector: lcp && lcp.targetSelector,
      load_event: toServerDuration(navTimings && navTimings.loadEvent),
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
    startTime: view.startClocks.relative,
    duration: view.duration,
    domainContext: {
      location: view.location,
    },
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
    },
  }
}

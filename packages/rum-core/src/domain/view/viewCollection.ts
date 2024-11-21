import type { Duration, ServerDuration, Observable } from '@datadog/browser-core'
import { isEmptyObject, mapValues, toServerDuration } from '@datadog/browser-core'
import { discardNegativeDuration } from '../discardNegativeDuration'
import type { RecorderApi } from '../../boot/rumPublicApi'
import type { RawRumViewEvent, ViewPerformanceData } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { LifeCycle, RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { LocationChange } from '../../browser/locationChangeObservable'
import type { RumConfiguration } from '../configuration'
import type { PageStateHistory } from '../contexts/pageStateHistory'
import type { ViewHistory } from '../contexts/viewHistory'
import type { Hooks, PartialRumEvent } from '../../hooks'
import { HookNames } from '../../hooks'
import { trackViews } from './trackViews'
import type { ViewEvent, ViewOptions } from './trackViews'
import type { CommonViewMetrics } from './viewMetrics/trackCommonViewMetrics'
import type { InitialViewMetrics } from './viewMetrics/trackInitialViewMetrics'

export function startViewCollection(
  lifeCycle: LifeCycle,
  hooks: Hooks,
  configuration: RumConfiguration,
  location: Location,
  domMutationObservable: Observable<void>,
  pageOpenObservable: Observable<void>,
  locationChangeObservable: Observable<LocationChange>,
  pageStateHistory: PageStateHistory,
  recorderApi: RecorderApi,
  viewHistory: ViewHistory,
  initialViewOptions?: ViewOptions
) {
  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) =>
    lifeCycle.notify(
      LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
      processViewUpdate(view, configuration, recorderApi, pageStateHistory)
    )
  )

  hooks.register(HookNames.Assemble, ({ startTime, eventType }): PartialRumEvent | undefined => {
    const { service, version, id, name, context } = viewHistory.findView(startTime)!

    return {
      type: eventType,
      service,
      version,
      context,
      view: {
        id,
        name,
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
  recorderApi: RecorderApi,
  pageStateHistory: PageStateHistory
): RawRumEventCollectedData<RawRumViewEvent> {
  const replayStats = recorderApi.getReplayStats(view.id)
  const pageStates = pageStateHistory.findAll(view.startClocks.relative, view.duration)
  const viewEvent: RawRumViewEvent = {
    _dd: {
      document_version: view.documentVersion,
      replay_stats: replayStats,
      page_states: pageStates,
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
      largest_contentful_paint_resource_url: view.initialViewMetrics.largestContentfulPaint?.resourceUrl,
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
    session: {
      has_replay: replayStats ? true : undefined,
      is_active: view.sessionIsActive ? undefined : false,
    },
    privacy: {
      replay_level: configuration.defaultPrivacyLevel,
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
    },
  }
}

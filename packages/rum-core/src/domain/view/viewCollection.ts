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
import type { FeatureFlagContexts } from '../contexts/featureFlagContext'
import type { PageStateHistory } from '../contexts/pageStateHistory'
import type { ViewEvent, ViewOptions } from './trackViews'
import { trackViews } from './trackViews'
import type { CumulativeLayoutShift } from './viewMetrics/trackCumulativeLayoutShift'
import type { FirstInput } from './viewMetrics/trackFirstInput'
import type { InteractionToNextPaint } from './viewMetrics/trackInteractionToNextPaint'
import type { LargestContentfulPaint } from './viewMetrics/trackLargestContentfulPaint'

export function startViewCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  location: Location,
  domMutationObservable: Observable<void>,
  pageOpenObserable: Observable<void>,
  locationChangeObservable: Observable<LocationChange>,
  featureFlagContexts: FeatureFlagContexts,
  pageStateHistory: PageStateHistory,
  recorderApi: RecorderApi,
  initialViewOptions?: ViewOptions
) {
  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) =>
    lifeCycle.notify(
      LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
      processViewUpdate(view, configuration, featureFlagContexts, recorderApi, pageStateHistory)
    )
  )
  return trackViews(
    location,
    lifeCycle,
    domMutationObservable,
    pageOpenObserable,
    configuration,
    locationChangeObservable,
    !configuration.trackViewsManually,
    initialViewOptions
  )
}

function processViewUpdate(
  view: ViewEvent,
  configuration: RumConfiguration,
  featureFlagContexts: FeatureFlagContexts,
  recorderApi: RecorderApi,
  pageStateHistory: PageStateHistory
): RawRumEventCollectedData<RawRumViewEvent> {
  const replayStats = recorderApi.getReplayStats(view.id)
  const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations(view.startClocks.relative)
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
      load_event: toServerDuration(view.initialViewMetrics.navigationTimings?.loadEvent),
      loading_time: discardNegativeDuration(toServerDuration(view.commonViewMetrics.loadingTime)),
      loading_type: view.loadingType,
      long_task: {
        count: view.eventCounts.longTaskCount,
      },
      resource: {
        count: view.eventCounts.resourceCount,
      },
      time_spent: toServerDuration(view.duration),
    },
    feature_flags: featureFlagContext && !isEmptyObject(featureFlagContext) ? featureFlagContext : undefined,
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
    performance: {
      cls: collectCLS(view.commonViewMetrics.cumulativeLayoutShift),
      fcp: collectFCP(view.initialViewMetrics.firstContentfulPaint),
      fid: collectFID(view.initialViewMetrics.firstInput),
      inp: collectINP(view.commonViewMetrics.interactionToNextPaint),
      lcp: collectLCP(view.initialViewMetrics.largestContentfulPaint),
    },
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

function collectCLS(cls: CumulativeLayoutShift | undefined): ViewPerformanceData['cls'] {
  return cls
    ? {
        score: cls.value,
        timestamp: toServerDuration(cls.time),
        target_selector: cls.targetSelector,
      }
    : undefined
}

function collectFCP(fcp: Duration | undefined): ViewPerformanceData['fcp'] {
  return fcp
    ? {
        timestamp: toServerDuration(fcp),
      }
    : undefined
}

function collectFID(fid: FirstInput | undefined): ViewPerformanceData['fid'] {
  return fid
    ? {
        duration: toServerDuration(fid.delay),
        timestamp: toServerDuration(fid.time),
        target_selector: fid.targetSelector,
      }
    : undefined
}

function collectINP(inp: InteractionToNextPaint | undefined): ViewPerformanceData['inp'] {
  return inp
    ? {
        duration: toServerDuration(inp.value),
        timestamp: toServerDuration(inp.time),
        target_selector: inp.targetSelector,
      }
    : undefined
}

function collectLCP(lcp: LargestContentfulPaint | undefined): ViewPerformanceData['lcp'] {
  return lcp
    ? {
        timestamp: toServerDuration(lcp.value),
        target_selector: lcp.targetSelector,
      }
    : undefined
}

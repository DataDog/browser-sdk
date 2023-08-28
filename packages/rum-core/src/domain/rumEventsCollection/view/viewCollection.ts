import type { Duration, ServerDuration, Observable } from '@datadog/browser-core'
import {
  isExperimentalFeatureEnabled,
  ExperimentalFeature,
  isEmptyObject,
  mapValues,
  toServerDuration,
  isNumber,
} from '@datadog/browser-core'
import type { RecorderApi } from '../../../boot/rumPublicApi'
import type { RawRumViewEvent } from '../../../rawRumEvent.types'
import { RumEventType } from '../../../rawRumEvent.types'
import type { LifeCycle, RawRumEventCollectedData } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import { mapToForegroundPeriods } from '../../contexts/foregroundContexts'
import type { LocationChange } from '../../../browser/locationChangeObservable'
import type { RumConfiguration } from '../../configuration'
import type { FeatureFlagContexts } from '../../contexts/featureFlagContext'
import type { PageStateHistory } from '../../contexts/pageStateHistory'
import type { ViewEvent, ViewOptions } from './trackViews'
import { trackViews } from './trackViews'
import type { WebVitalTelemetryDebug } from './startWebVitalTelemetryDebug'

export function startViewCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  location: Location,
  domMutationObservable: Observable<void>,
  locationChangeObservable: Observable<LocationChange>,
  featureFlagContexts: FeatureFlagContexts,
  pageStateHistory: PageStateHistory,
  recorderApi: RecorderApi,
  webVitalTelemetryDebug: WebVitalTelemetryDebug,
  initialViewOptions?: ViewOptions
) {
  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) =>
    lifeCycle.notify(
      LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
      processViewUpdate(view, configuration, featureFlagContexts, recorderApi, pageStateHistory)
    )
  )
  const trackViewResult = trackViews(
    location,
    lifeCycle,
    domMutationObservable,
    configuration,
    locationChangeObservable,
    !configuration.trackViewsManually,
    webVitalTelemetryDebug,
    initialViewOptions
  )

  return trackViewResult
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
  const pageStatesEnabled = isExperimentalFeatureEnabled(ExperimentalFeature.PAGE_STATES)
  const pageStates = pageStateHistory.findAll(view.startClocks.relative, view.duration)
  const viewEvent: RawRumViewEvent = {
    _dd: {
      document_version: view.documentVersion,
      replay_stats: replayStats,
      page_states: pageStatesEnabled ? pageStates : undefined,
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
      cumulative_layout_shift: view.cumulativeLayoutShift,
      first_byte: toServerDuration(view.timings.firstByte),
      dom_complete: toServerDuration(view.timings.domComplete),
      dom_content_loaded: toServerDuration(view.timings.domContentLoaded),
      dom_interactive: toServerDuration(view.timings.domInteractive),
      error: {
        count: view.eventCounts.errorCount,
      },
      first_contentful_paint: toServerDuration(view.timings.firstContentfulPaint),
      first_input_delay: toServerDuration(view.timings.firstInputDelay),
      first_input_time: toServerDuration(view.timings.firstInputTime),
      interaction_to_next_paint: toServerDuration(view.interactionToNextPaint),
      is_active: view.isActive,
      name: view.name,
      largest_contentful_paint: toServerDuration(view.timings.largestContentfulPaint),
      load_event: toServerDuration(view.timings.loadEvent),
      loading_time: discardNegativeDuration(toServerDuration(view.loadingTime)),
      loading_type: view.loadingType,
      long_task: {
        count: view.eventCounts.longTaskCount,
      },
      resource: {
        count: view.eventCounts.resourceCount,
      },
      time_spent: toServerDuration(view.duration),
      in_foreground_periods:
        !pageStatesEnabled && pageStates ? mapToForegroundPeriods(pageStates, view.duration) : undefined, // Todo: Remove in the next major release
    },
    feature_flags: featureFlagContext && !isEmptyObject(featureFlagContext) ? featureFlagContext : undefined,
    display: view.scrollMetrics
      ? {
          scroll: {
            max_depth: view.scrollMetrics.maxDepth,
            max_depth_scroll_height: view.scrollMetrics.maxDepthScrollHeight,
            max_depth_scroll_top: view.scrollMetrics.maxDepthScrollTop,
            max_depth_time: toServerDuration(view.scrollMetrics.maxDepthTime),
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

function discardNegativeDuration(duration: ServerDuration | undefined): ServerDuration | undefined {
  return isNumber(duration) && duration < 0 ? undefined : duration
}

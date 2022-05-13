import type { Duration, ServerDuration, Observable } from '@datadog/browser-core'
import { isEmptyObject, mapValues, toServerDuration, isNumber } from '@datadog/browser-core'
import type { RecorderApi } from '../../../boot/rumPublicApi'
import type { RawRumViewEvent } from '../../../rawRumEvent.types'
import { RumEventType } from '../../../rawRumEvent.types'
import type { LifeCycle, RawRumEventCollectedData } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import type { ForegroundContexts } from '../../foregroundContexts'
import type { LocationChange } from '../../../browser/locationChangeObservable'
import type { RumConfiguration } from '../../configuration'
import type { ViewEvent, ViewOptions } from './trackViews'
import { trackViews } from './trackViews'

export function startViewCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  location: Location,
  domMutationObservable: Observable<void>,
  locationChangeObservable: Observable<LocationChange>,
  foregroundContexts: ForegroundContexts,
  recorderApi: RecorderApi,
  initialViewOptions?: ViewOptions
) {
  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) =>
    lifeCycle.notify(
      LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
      processViewUpdate(view, foregroundContexts, recorderApi)
    )
  )

  return trackViews(
    location,
    lifeCycle,
    domMutationObservable,
    configuration,
    locationChangeObservable,
    !configuration.trackViewsManually,
    initialViewOptions
  )
}

function processViewUpdate(
  view: ViewEvent,
  foregroundContexts: ForegroundContexts,
  recorderApi: RecorderApi
): RawRumEventCollectedData<RawRumViewEvent> {
  const replayStats = recorderApi.getReplayStats(view.id)
  const viewEvent: RawRumViewEvent = {
    _dd: {
      document_version: view.documentVersion,
      replay_stats: replayStats,
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
      dom_complete: toServerDuration(view.timings.domComplete),
      dom_content_loaded: toServerDuration(view.timings.domContentLoaded),
      dom_interactive: toServerDuration(view.timings.domInteractive),
      error: {
        count: view.eventCounts.errorCount,
      },
      first_contentful_paint: toServerDuration(view.timings.firstContentfulPaint),
      first_input_delay: toServerDuration(view.timings.firstInputDelay),
      first_input_time: toServerDuration(view.timings.firstInputTime),
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
      in_foreground_periods: foregroundContexts.selectInForegroundPeriodsFor(view.startClocks.relative, view.duration),
    },
    session: {
      has_replay: replayStats ? true : undefined,
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

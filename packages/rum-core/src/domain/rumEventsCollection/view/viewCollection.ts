import {
  Duration,
  isEmptyObject,
  mapValues,
  ServerDuration,
  toServerDuration,
  Configuration,
} from '@datadog/browser-core'
import { RawRumViewEvent, RumEventType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType, RawRumEventCollectedData } from '../../lifeCycle'
import { DOMMutationObservable } from '../../../browser/domMutationObservable'
import { ForegroundContexts } from '../../foregroundContexts'
import { trackViews, ViewEvent } from './trackViews'

export function startViewCollection(
  lifeCycle: LifeCycle,
  configuration: Configuration,
  location: Location,
  domMutationObservable: DOMMutationObservable,
  foregroundContexts: ForegroundContexts,
  initialViewName?: string
) {
  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) =>
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processViewUpdate(view, foregroundContexts))
  )

  return trackViews(location, lifeCycle, domMutationObservable, !configuration.trackViewsManually, initialViewName)
}

function processViewUpdate(
  view: ViewEvent,
  foregroundContexts: ForegroundContexts
): RawRumEventCollectedData<RawRumViewEvent> {
  const viewEvent: RawRumViewEvent = {
    _dd: {
      document_version: view.documentVersion,
    },
    date: view.startClocks.timeStamp,
    type: RumEventType.VIEW,
    view: {
      action: {
        count: view.eventCounts.userActionCount,
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
      loading_time: toServerDuration(view.loadingTime),
      loading_type: view.loadingType,
      long_task: {
        count: view.eventCounts.longTaskCount,
      },
      resource: {
        count: view.eventCounts.resourceCount,
      },
      time_spent: toServerDuration(view.duration),
      in_foreground_periods: foregroundContexts.getInForegroundPeriods(view.startClocks.relative, view.duration),
    },
    session: {
      has_replay: view.hasReplay || undefined,
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

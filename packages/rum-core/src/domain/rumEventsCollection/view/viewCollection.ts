import { Configuration, getTimestamp, isEmptyObject, mapValues, msToNs } from '@datadog/browser-core'
import { RawRumViewEvent, RumEventType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { trackViews, View } from './trackViews'

export function startViewCollection(lifeCycle: LifeCycle, configuration: Configuration, location: Location) {
  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) =>
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processViewUpdate(view))
  )

  return trackViews(location, lifeCycle)
}

function processViewUpdate(view: View) {
  const viewEvent: RawRumViewEvent = {
    _dd: {
      document_version: view.documentVersion,
    },
    date: getTimestamp(view.startTime),
    type: RumEventType.VIEW,
    view: {
      action: {
        count: view.eventCounts.userActionCount,
      },
      cumulative_layout_shift: view.cumulativeLayoutShift,
      dom_complete: msToNs(view.timings.domComplete),
      dom_content_loaded: msToNs(view.timings.domContentLoaded),
      dom_interactive: msToNs(view.timings.domInteractive),
      error: {
        count: view.eventCounts.errorCount,
      },
      first_contentful_paint: msToNs(view.timings.firstContentfulPaint),
      first_input_delay: msToNs(view.timings.firstInputDelay),
      first_input_time: msToNs(view.timings.firstInputTime),
      is_active: view.isActive,
      largest_contentful_paint: msToNs(view.timings.largestContentfulPaint),
      load_event: msToNs(view.timings.loadEvent),
      loading_time: msToNs(view.loadingTime),
      loading_type: view.loadingType,
      long_task: {
        count: view.eventCounts.longTaskCount,
      },
      resource: {
        count: view.eventCounts.resourceCount,
      },
      time_spent: msToNs(view.duration),
    },
  }
  if (!isEmptyObject(view.customTimings)) {
    viewEvent.view.custom_timings = mapValues(view.customTimings, msToNs)
  }
  return {
    rawRumEvent: viewEvent,
    startTime: view.startTime,
  }
}

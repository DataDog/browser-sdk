import {
  getTimeStamp,
  isEmptyObject,
  mapValues,
  toOptionalServerDuration,
  toServerDuration,
} from '@datadog/browser-core'
import { NewLocationListener } from '../../../boot/rum'
import { RawRumViewEvent, RumEventType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { trackViews, View } from './trackViews'

export function startViewCollection(lifeCycle: LifeCycle, location: Location, onNewLocation?: NewLocationListener) {
  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) =>
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processViewUpdate(view))
  )

  return trackViews(location, lifeCycle, onNewLocation)
}

function processViewUpdate(view: View) {
  const viewEvent: RawRumViewEvent = {
    _dd: {
      document_version: view.documentVersion,
    },
    date: getTimeStamp(view.startTime),
    type: RumEventType.VIEW,
    view: {
      action: {
        count: view.eventCounts.userActionCount,
      },
      cumulative_layout_shift: view.cumulativeLayoutShift,
      dom_complete: toOptionalServerDuration(view.timings.domComplete),
      dom_content_loaded: toOptionalServerDuration(view.timings.domContentLoaded),
      dom_interactive: toOptionalServerDuration(view.timings.domInteractive),
      error: {
        count: view.eventCounts.errorCount,
      },
      first_contentful_paint: toOptionalServerDuration(view.timings.firstContentfulPaint),
      first_input_delay: toOptionalServerDuration(view.timings.firstInputDelay),
      first_input_time: toOptionalServerDuration(view.timings.firstInputTime),
      is_active: view.isActive,
      name: view.name,
      largest_contentful_paint: toOptionalServerDuration(view.timings.largestContentfulPaint),
      load_event: toOptionalServerDuration(view.timings.loadEvent),
      loading_time: toOptionalServerDuration(view.loadingTime),
      loading_type: view.loadingType,
      long_task: {
        count: view.eventCounts.longTaskCount,
      },
      resource: {
        count: view.eventCounts.resourceCount,
      },
      time_spent: toServerDuration(view.duration),
    },
  }
  if (!isEmptyObject(view.customTimings)) {
    viewEvent.view.custom_timings = mapValues(view.customTimings, toServerDuration)
  }
  return {
    rawRumEvent: viewEvent,
    startTime: view.startTime,
  }
}

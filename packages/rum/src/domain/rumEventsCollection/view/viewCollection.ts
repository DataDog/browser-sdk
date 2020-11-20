import { Configuration, getTimestamp, msToNs } from '@datadog/browser-core'
import { RumEventType, RumViewEventV2 } from '../../../typesV2'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { trackViews, View } from './trackViews'

export function startViewCollection(lifeCycle: LifeCycle, configuration: Configuration, location: Location) {
  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) =>
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, processViewUpdateV2(view))
  )

  return trackViews(location, lifeCycle)
}

function processViewUpdateV2(view: View) {
  const viewEvent: RumViewEventV2 = {
    _dd: {
      documentVersion: view.documentVersion,
    },
    date: getTimestamp(view.startTime),
    type: RumEventType.VIEW,
    view: {
      action: {
        count: view.eventCounts.userActionCount,
      },
      domComplete: msToNs(view.timings.domComplete),
      domContentLoaded: msToNs(view.timings.domContentLoaded),
      domInteractive: msToNs(view.timings.domInteractive),
      error: {
        count: view.eventCounts.errorCount,
      },
      firstContentfulPaint: msToNs(view.timings.firstContentfulPaint),
      firstInputDelay: msToNs(view.timings.firstInputDelay),
      largestContentfulPaint: msToNs(view.timings.largestContentfulPaint),
      loadEventEnd: msToNs(view.timings.loadEventEnd),
      loadingTime: msToNs(view.loadingTime),
      loadingType: view.loadingType,
      longTask: {
        count: view.eventCounts.longTaskCount,
      },
      resource: {
        count: view.eventCounts.resourceCount,
      },
      timeSpent: msToNs(view.duration),
    },
  }
  return {
    rawRumEvent: viewEvent,
    startTime: view.startTime,
  }
}

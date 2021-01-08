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
      documentVersion: view.documentVersion,
    },
    date: getTimestamp(view.startTime),
    type: RumEventType.VIEW,
    view: {
      action: {
        count: view.eventCounts.userActionCount,
      },
      cumulativeLayoutShift: view.cumulativeLayoutShift,
      domComplete: msToNs(view.timings.domComplete),
      domContentLoaded: msToNs(view.timings.domContentLoaded),
      domInteractive: msToNs(view.timings.domInteractive),
      error: {
        count: view.eventCounts.errorCount,
      },
      firstContentfulPaint: msToNs(view.timings.firstContentfulPaint),
      firstInputDelay: msToNs(view.timings.firstInputDelay),
      isActive: view.isActive,
      largestContentfulPaint: msToNs(view.timings.largestContentfulPaint),
      loadEvent: msToNs(view.timings.loadEvent),
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
  if (!isEmptyObject(view.customTimings)) {
    viewEvent.view.customTimings = mapValues(view.customTimings, msToNs)
  }
  return {
    rawRumEvent: viewEvent,
    startTime: view.startTime,
  }
}

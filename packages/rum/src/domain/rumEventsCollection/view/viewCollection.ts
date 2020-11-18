import { Configuration, getTimestamp, msToNs } from '@datadog/browser-core'
import { RumEventCategory, RumViewEvent } from '../../../types'
import { RumEventType, RumViewEventV2 } from '../../../typesV2'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { trackViews, View } from './trackViews'

export function startViewCollection(lifeCycle: LifeCycle, configuration: Configuration, location: Location) {
  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) => {
    configuration.isEnabled('v2_format')
      ? lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, processViewUpdateV2(view))
      : lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processViewUpdate(view))
  })

  return trackViews(location, lifeCycle)
}

function processViewUpdate(view: View) {
  const viewEvent: RumViewEvent = {
    date: getTimestamp(view.startTime),
    duration: msToNs(view.duration),
    evt: {
      category: RumEventCategory.VIEW,
    },
    rum: {
      documentVersion: view.documentVersion,
    },
    view: {
      loadingTime: msToNs(view.loadingTime),
      loadingType: view.loadingType,
      measures: {
        ...view.eventCounts,
        domComplete: msToNs(view.timings.domComplete),
        domContentLoaded: msToNs(view.timings.domContentLoaded),
        domInteractive: msToNs(view.timings.domInteractive),
        firstContentfulPaint: msToNs(view.timings.firstContentfulPaint),
        loadEventEnd: msToNs(view.timings.loadEventEnd),
      },
    },
  }
  return {
    rawRumEvent: viewEvent,
    startTime: view.startTime,
  }
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
      cumulativeLayoutShift: view.cumulativeLayoutShift,
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

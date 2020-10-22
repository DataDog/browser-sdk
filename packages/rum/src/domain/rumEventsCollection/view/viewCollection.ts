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

  trackViews(location, lifeCycle)
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
        ...view.measures,
        domComplete: msToNs(view.measures.domComplete),
        domContentLoaded: msToNs(view.measures.domContentLoaded),
        domInteractive: msToNs(view.measures.domInteractive),
        firstContentfulPaint: msToNs(view.measures.firstContentfulPaint),
        loadEventEnd: msToNs(view.measures.loadEventEnd),
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
        count: view.measures.userActionCount,
      },
      domComplete: msToNs(view.measures.domComplete),
      domContentLoaded: msToNs(view.measures.domContentLoaded),
      domInteractive: msToNs(view.measures.domInteractive),
      error: {
        count: view.measures.errorCount,
      },
      firstContentfulPaint: msToNs(view.measures.firstContentfulPaint),
      loadEventEnd: msToNs(view.measures.loadEventEnd),
      loadingTime: msToNs(view.loadingTime),
      loadingType: view.loadingType,
      longTask: {
        count: view.measures.longTaskCount,
      },
      resource: {
        count: view.measures.resourceCount,
      },
      timeSpent: msToNs(view.duration),
    },
  }
  return {
    rawRumEvent: viewEvent,
    startTime: view.startTime,
  }
}

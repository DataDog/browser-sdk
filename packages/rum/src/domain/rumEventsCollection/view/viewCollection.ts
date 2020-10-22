import { Configuration, getTimestamp, msToNs } from '@datadog/browser-core'
import { RumEventCategory, RumViewEvent } from '../../../types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { trackViews, View } from './trackViews'

export function startViewCollection(lifeCycle: LifeCycle, configuration: Configuration, location: Location) {
  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) => {
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processViewUpdate(view))
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

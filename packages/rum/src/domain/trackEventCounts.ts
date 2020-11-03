import { noop } from '@datadog/browser-core'
import { RumEventCategory } from '../types'
import { RumEventType } from '../typesV2'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'

export interface EventCounts {
  errorCount: number
  userActionCount: number
  longTaskCount: number
  resourceCount: number
}

export function trackEventCounts(lifeCycle: LifeCycle, callback: (eventCounts: EventCounts) => void = noop) {
  const eventCounts = {
    errorCount: 0,
    longTaskCount: 0,
    resourceCount: 0,
    userActionCount: 0,
  }

  const subscription = lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, ({ rawRumEvent }): void => {
    switch (rawRumEvent.evt.category) {
      case RumEventCategory.ERROR:
        eventCounts.errorCount += 1
        callback(eventCounts)
        break
      case RumEventCategory.USER_ACTION:
        eventCounts.userActionCount += 1
        callback(eventCounts)
        break
      case RumEventCategory.LONG_TASK:
        eventCounts.longTaskCount += 1
        callback(eventCounts)
        break
      case RumEventCategory.RESOURCE:
        eventCounts.resourceCount += 1
        callback(eventCounts)
        break
    }
  })

  const subscriptionV2 = lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, ({ rawRumEvent }): void => {
    switch (rawRumEvent.type) {
      case RumEventType.ERROR:
        eventCounts.errorCount += 1
        callback(eventCounts)
        break
      case RumEventType.ACTION:
        eventCounts.userActionCount += 1
        callback(eventCounts)
        break
      case RumEventType.LONG_TASK:
        eventCounts.longTaskCount += 1
        callback(eventCounts)
        break
      case RumEventType.RESOURCE:
        eventCounts.resourceCount += 1
        callback(eventCounts)
        break
    }
  })

  return {
    stop() {
      subscription.unsubscribe()
      subscriptionV2.unsubscribe()
    },
    eventCounts,
  }
}

import { noop } from '@datadog/browser-core'
import { RumEventType } from '../rawRumEvent.types'
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

  const subscription = lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, ({ type }): void => {
    switch (type) {
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
    stop: () => {
      subscription.unsubscribe()
    },
    eventCounts,
  }
}

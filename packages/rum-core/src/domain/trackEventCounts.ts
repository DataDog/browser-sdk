import { noop } from '@datadog/browser-core'
import { RumEventType } from '../rawRumEvent.types'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'

export interface EventCounts {
  errorCount: number
  actionCount: number
  longTaskCount: number
  resourceCount: number
  frustrationCount: number
}

export function trackEventCounts(lifeCycle: LifeCycle, callback: (eventCounts: EventCounts) => void = noop) {
  const eventCounts: EventCounts = {
    errorCount: 0,
    longTaskCount: 0,
    resourceCount: 0,
    actionCount: 0,
    frustrationCount: 0,
  }

  const subscription = lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event): void => {
    switch (event.type) {
      case RumEventType.ERROR:
        eventCounts.errorCount += 1
        callback(eventCounts)
        break
      case RumEventType.ACTION:
        eventCounts.actionCount += 1
        if (event.action.frustration) {
          eventCounts.frustrationCount += event.action.frustration.type.length
        }
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

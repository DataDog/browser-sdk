import { noop } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType, Subscription } from './lifeCycle'

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
  const subscriptions: Subscription[] = []

  subscriptions.push(
    lifeCycle.subscribe(LifeCycleEventType.ERROR_COLLECTED, () => {
      eventCounts.errorCount += 1
      callback(eventCounts)
    })
  )
  subscriptions.push(
    lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, () => {
      eventCounts.userActionCount += 1
      callback(eventCounts)
    })
  )
  subscriptions.push(
    lifeCycle.subscribe(LifeCycleEventType.CUSTOM_ACTION_COLLECTED, () => {
      eventCounts.userActionCount += 1
      callback(eventCounts)
    })
  )
  subscriptions.push(
    lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
      if (entry.entryType === 'longtask') {
        eventCounts.longTaskCount += 1
        callback(eventCounts)
      }
    })
  )
  subscriptions.push(
    lifeCycle.subscribe(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH, () => {
      eventCounts.resourceCount += 1
      callback(eventCounts)
    })
  )
  return {
    stop() {
      subscriptions.forEach((s) => s.unsubscribe())
    },
    eventCounts,
  }
}

import { noop } from '@datadog/browser-core'
import { RumEventType } from '../rawRumEvent.types'
import type { RumActionEvent, RumErrorEvent, RumLongTaskEvent, RumResourceEvent } from '../rumEvent.types'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'

export interface EventCounts {
  errorCount: number
  actionCount: number
  longTaskCount: number
  resourceCount: number
  frustrationCount: number
}

export function trackEventCounts({
  lifeCycle,
  isChildEvent,
  onChange: callback = noop,
}: {
  lifeCycle: LifeCycle
  isChildEvent: (event: RumActionEvent | RumErrorEvent | RumLongTaskEvent | RumResourceEvent) => boolean
  onChange?: () => void
}) {
  const eventCounts: EventCounts = {
    errorCount: 0,
    longTaskCount: 0,
    resourceCount: 0,
    actionCount: 0,
    frustrationCount: 0,
  }

  const subscription = lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event): void => {
    if (event.type === 'view' || event.type === 'vital' || !isChildEvent(event)) {
      return
    }
    switch (event.type) {
      case RumEventType.ERROR:
        eventCounts.errorCount += 1
        callback()
        break
      case RumEventType.ACTION:
        eventCounts.actionCount += 1
        if (event.action.frustration) {
          eventCounts.frustrationCount += event.action.frustration.type.length
        }
        callback()
        break
      case RumEventType.LONG_TASK:
        eventCounts.longTaskCount += 1
        callback()
        break
      case RumEventType.RESOURCE:
        if (!event._dd?.discarded) {
          eventCounts.resourceCount += 1
          callback()
        }
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

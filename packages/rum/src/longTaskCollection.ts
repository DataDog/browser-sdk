import { getTimestamp, msToNs } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { RumEventCategory, RumLongTaskEvent } from './rum'

export function startLongTaskCollection(lifeCycle: LifeCycle) {
  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (entry.entryType !== 'longtask') {
      return
    }
    const rawRumEvent: RumLongTaskEvent = {
      date: getTimestamp(entry.startTime),
      duration: msToNs(entry.duration),
      evt: {
        category: RumEventCategory.LONG_TASK,
      },
    }
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      rawRumEvent,
      startTime: entry.startTime,
    })
  })
}

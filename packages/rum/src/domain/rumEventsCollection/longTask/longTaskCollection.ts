import { Configuration, getTimestamp, msToNs } from '@datadog/browser-core'
import { RumEventType, RumLongTaskEvent } from '../../../types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'

export function startLongTaskCollection(lifeCycle: LifeCycle, configuration: Configuration) {
  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (entry.entryType !== 'longtask') {
      return
    }
    const rawRumEvent: RumLongTaskEvent = {
      date: getTimestamp(entry.startTime),
      longTask: {
        duration: msToNs(entry.duration),
      },
      type: RumEventType.LONG_TASK,
    }
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      rawRumEvent,
      startTime: entry.startTime,
    })
  })
}

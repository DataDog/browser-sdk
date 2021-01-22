import { Configuration, getTimestamp, msToNs } from '@datadog/browser-core'
import { RawRumLongTaskEvent, RumEventType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'

export function startLongTaskCollection(lifeCycle: LifeCycle, configuration: Configuration) {
  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (entry.entryType !== 'longtask') {
      return
    }
    const rawRumEvent: RawRumLongTaskEvent = {
      date: getTimestamp(entry.startTime),
      long_task: {
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

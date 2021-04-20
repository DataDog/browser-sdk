import { toServerDuration, getCorrectedTimeStamp, preferredTime } from '@datadog/browser-core'
import { RawRumLongTaskEvent, RumEventType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'

export function startLongTaskCollection(lifeCycle: LifeCycle) {
  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (entry.entryType !== 'longtask') {
      return
    }
    const timestamp = getCorrectedTimeStamp(entry.startTime)
    const rawRumEvent: RawRumLongTaskEvent = {
      date: timestamp,
      long_task: {
        duration: toServerDuration(entry.duration),
      },
      type: RumEventType.LONG_TASK,
    }
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      rawRumEvent,
      startTime: preferredTime(timestamp, entry.startTime),
    })
  })
}

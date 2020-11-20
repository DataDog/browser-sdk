import { Configuration, getTimestamp, msToNs } from '@datadog/browser-core'
import { RumEventType, RumLongTaskEventV2 } from '../../../typesV2'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'

export function startLongTaskCollection(lifeCycle: LifeCycle, configuration: Configuration) {
  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (entry.entryType !== 'longtask') {
      return
    }
    const rawRumEvent: RumLongTaskEventV2 = {
      date: getTimestamp(entry.startTime),
      longTask: {
        duration: msToNs(entry.duration),
      },
      type: RumEventType.LONG_TASK,
    }
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
      rawRumEvent,
      startTime: entry.startTime,
    })
  })
}

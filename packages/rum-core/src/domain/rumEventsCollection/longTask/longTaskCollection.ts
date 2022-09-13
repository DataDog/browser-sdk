import { toServerDuration, relativeToClocks, generateUUID } from '@datadog/browser-core'
import type { RawRumLongTaskEvent } from '../../../rawRumEvent.types'
import { RumEventType } from '../../../rawRumEvent.types'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'

export function startLongTaskCollection(lifeCycle: LifeCycle) {
  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    for (const entry of entries) {
      if (entry.entryType !== 'longtask') {
        break
      }
      const startClocks = relativeToClocks(entry.startTime)
      const rawRumEvent: RawRumLongTaskEvent = {
        date: startClocks.timeStamp,
        long_task: {
          id: generateUUID(),
          duration: toServerDuration(entry.duration),
        },
        type: RumEventType.LONG_TASK,
      }
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent,
        startTime: startClocks.relative,
        domainContext: { performanceEntry: entry.toJSON() },
      })
    }
  })
}

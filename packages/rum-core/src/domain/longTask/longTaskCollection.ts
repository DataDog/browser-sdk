import { toServerDuration, relativeToClocks, generateUUID } from '@datadog/browser-core'
import type { RawRumLongTaskEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { RumPerformanceEntryType } from '../../browser/performanceCollection'
import type { RumConfiguration } from '../configuration'

export function startLongTaskCollection(lifeCycle: LifeCycle, configuration: RumConfiguration) {
  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    for (const entry of entries) {
      if (entry.entryType !== RumPerformanceEntryType.LONG_TASK) {
        break
      }
      if (!configuration.trackLongTasks) {
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
        _dd: {
          discarded: false,
        },
      }
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent,
        startTime: startClocks.relative,
        domainContext: { performanceEntry: entry },
      })
    }
  })
}

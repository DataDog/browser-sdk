import { toServerDuration, relativeToClocks, generateUUID } from '@datadog/browser-core'
import type { RawRumLongTaskEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { RumSessionManager } from '../rumSessionManager'
import { RumPerformanceEntryType } from '../../browser/performanceCollection'
import type { RumConfiguration } from '../configuration'

export function startLongTaskCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager
) {
  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    for (const entry of entries) {
      if (entry.entryType !== RumPerformanceEntryType.LONG_TASK) {
        break
      }
      const session = sessionManager.findTrackedSession(entry.startTime)
      if (!session || !configuration.trackLongTasks) {
        break
      }
      const startClocks = relativeToClocks(entry.startTime)
      const rawRumEvent: RawRumLongTaskEvent = {
        date: startClocks.timeStamp,
        type: RumEventType.LONG_TASK,
        long_task: {
          id: generateUUID(),
          duration: toServerDuration(entry.duration),
        },
        _dd: {
          discarded: false,
        },
      }
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        startTime: startClocks.relative,
        rawRumEvent,
        domainContext: { performanceEntry: entry },
      })
    }
  })
}

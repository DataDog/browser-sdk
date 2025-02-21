import { toServerDuration, relativeToClocks, generateUUID } from '@datadog/browser-core'
import type { RawRumLongTaskEvent } from '../../rawRumEvent.types'
import { RumEventType, RumLongTaskEntryType } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { createPerformanceObservable, RumPerformanceEntryType } from '../../browser/performanceObservable'
import type { RumConfiguration } from '../configuration'
export function startLongTaskCollection(lifeCycle: LifeCycle, configuration: RumConfiguration) {
  const performanceLongTaskSubscription = createPerformanceObservable(configuration, {
    type: RumPerformanceEntryType.LONG_TASK,
    buffered: true,
  }).subscribe((entries) => {
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
          entry_type: RumLongTaskEntryType.LONG_TASK,
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
        duration: entry.duration,
        domainContext: { performanceEntry: entry },
      })
    }
  })

  return {
    stop() {
      performanceLongTaskSubscription.unsubscribe()
    },
  }
}

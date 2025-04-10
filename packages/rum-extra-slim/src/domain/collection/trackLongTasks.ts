import {
  createPerformanceObservable,
  RumPerformanceEntryType,
} from '@datadog/browser-rum-core/src/browser/performanceObservable'
import type { TransportManager } from '../transportManager'
import { EVENT } from '../event'
import type { PerformanceLongTaskTimingEvent } from '../event'

export function trackLongTasks(transportManager: TransportManager): () => void {
  const observable = createPerformanceObservable({} as any, {
    type: RumPerformanceEntryType.LONG_ANIMATION_FRAME,
    buffered: true,
  })

  const subscription = observable.subscribe((entries) => {
    for (const entry of entries) {
      const data: PerformanceLongTaskTimingEvent = {
        type: EVENT.LONG_TASK_TIMING,
        entry: entry.toJSON(),
      }

      transportManager.send(data)
    }
  })

  return () => subscription.unsubscribe()
}

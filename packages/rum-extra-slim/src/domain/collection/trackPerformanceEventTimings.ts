import { RumPerformanceEntryType } from '@datadog/browser-rum-core'
import { createPerformanceObservable } from '@datadog/browser-rum-core/src/browser/performanceObservable'
import type { TransportManager } from '../transportManager'
import type { PerformanceEventTimingsEvent } from '../event'
import { EVENT } from '../event'

export function trackPerformanceEventTimings(transportManager: TransportManager) {
  const observable = createPerformanceObservable({} as any, {
    type: RumPerformanceEntryType.EVENT,
    buffered: true,
  })

  const subscription = observable.subscribe((entries) => {
    for (const entry of entries) {
      const data: PerformanceEventTimingsEvent = {
        type: EVENT.EVENT_TIMING,
        entry: entry.toJSON(),
      }

      transportManager.send(data)
    }
  })

  return () => subscription.unsubscribe()
}

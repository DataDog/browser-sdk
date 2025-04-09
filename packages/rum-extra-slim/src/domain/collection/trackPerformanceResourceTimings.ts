import { RumPerformanceEntryType } from '@datadog/browser-rum-core'
import { createPerformanceObservable } from '@datadog/browser-rum-core/src/browser/performanceObservable'
import type { TransportManager } from '../transportManager'
import { EVENT, type PerformanceResourceTimingsEvent } from '../event'

export function trackPerformanceResourceTimings(transportManager: TransportManager) {
  const observable = createPerformanceObservable({} as any, {
    type: RumPerformanceEntryType.RESOURCE,
    buffered: true,
  })

  const subscription = observable.subscribe((entries) => {
    for (const entry of entries) {
      if (entry.name.startsWith(transportManager.baseUrl)) {
        // Ignore entries from itself
        continue
      }

      const data: PerformanceResourceTimingsEvent = {
        type: EVENT.RESOURCE_TIMING,
        ...entry.toJSON(),
      }

      transportManager.send(data)
    }
  })

  return () => subscription.unsubscribe()
}

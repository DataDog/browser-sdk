import { RumPerformanceEntryType } from '@datadog/browser-rum-core'
import { createPerformanceObservable } from '@datadog/browser-rum-core/src/browser/performanceObservable'
import type { TransportManager } from '../transportManager'
import { EVENT, type PerformanceNavigationTimingsEvent } from '../event'

export function trackPerformanceNavigationTimings(transportManager: TransportManager) {
  const observable = createPerformanceObservable({} as any, {
    type: RumPerformanceEntryType.NAVIGATION,
    buffered: true,
  })

  const subscription = observable.subscribe((entries) => {
    for (const entry of entries) {
      const data: PerformanceNavigationTimingsEvent = {
        type: EVENT.NAVIGATION_TIMING,
        ...entry.toJSON(),
      }

      transportManager.send(data)
    }
  })

  return () => subscription.unsubscribe()
}

import { RumPerformanceEntryType } from '@datadog/browser-rum-core'
import { createPerformanceObservable } from '@datadog/browser-rum-core/src/browser/performanceObservable'
import type { TransportManager } from '../transportManager'
import type { NavigationTimingsEvent } from '../event'

export function trackNavigationTimings(transportManager: TransportManager) {
  const observable = createPerformanceObservable({} as any, {
    type: RumPerformanceEntryType.NAVIGATION,
    buffered: true,
  })

  const subscription = observable.subscribe((entries) => {
    for (const entry of entries) {
      const data: NavigationTimingsEvent = {
        type: 'navigation_timings',
        ...entry.toJSON(),
      }

      transportManager.send(data)
    }
  })

  return () => subscription.unsubscribe()
}

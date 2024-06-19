import { registerCleanupTask } from '@datadog/browser-core/test'
import type { RumPerformanceEntry } from '../../src/browser/performanceObservable'

export function mockPerformanceObserver() {
  const originalPerformanceObserver = window.PerformanceObserver
  const instances = new Set<{
    callback: PerformanceObserverCallback
    entryTypes: string[]
  }>()
  let performanceObserver: PerformanceObserver

  window.PerformanceObserver = function (callback: PerformanceObserverCallback) {
    const instance = { callback, entryTypes: [] as string[] }

    performanceObserver = {
      disconnect() {
        instances.delete(instance)
      },
      observe({ entryTypes, type }: PerformanceObserverInit) {
        instance.entryTypes = entryTypes || (type ? [type] : [])
        instances.add(instance)
      },
      takeRecords() {
        return []
      },
    }
    return performanceObserver
  } as unknown as typeof originalPerformanceObserver

  registerCleanupTask(() => {
    window.PerformanceObserver = originalPerformanceObserver
    instances.clear()
  })

  return {
    notifyPerformanceEntry: (entry: RumPerformanceEntry) => {
      instances.forEach(({ callback, entryTypes }) => {
        if (entryTypes.includes(entry.entryType)) {
          callback(
            {
              getEntries: () => [entry] as PerformanceEntryList,
              getEntriesByName: () => [entry] as PerformanceEntryList,
              getEntriesByType: () => [entry] as PerformanceEntryList,
            },
            performanceObserver
          )
        }
      })
    },
  }
}

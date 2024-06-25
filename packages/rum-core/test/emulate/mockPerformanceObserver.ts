import { registerCleanupTask } from '@datadog/browser-core/test'
import type { RumPerformanceEntry } from '../../src/browser/performanceObservable'

type PerformanceObserverInstance = {
  callback: PerformanceObserverCallback
  entryTypes: string[]
}

export function mockPerformanceObserver() {
  const originalPerformanceObserver = window.PerformanceObserver
  const instances = new Set<PerformanceObserverInstance>()
  let performanceObserver: PerformanceObserver
  let bufferedEntries: RumPerformanceEntry[] = []

  window.PerformanceObserver = function (callback: PerformanceObserverCallback) {
    const instance = { callback, entryTypes: [] as string[] }

    performanceObserver = {
      disconnect() {
        instances.delete(instance)
      },
      observe({ entryTypes, type, buffered }: PerformanceObserverInit) {
        instance.entryTypes = entryTypes || (type ? [type] : [])
        instances.add(instance)
        if (buffered) {
          notify(instance, bufferedEntries)
        }
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
    bufferedEntries = []
  })

  function notify({ callback, entryTypes }: PerformanceObserverInstance, entries: RumPerformanceEntry[]) {
    const filteredEntries = entries.filter((entry) => entryTypes.includes(entry.entryType))
    if (!filteredEntries.length) {
      return
    }
    callback(
      {
        getEntries: () => filteredEntries as PerformanceEntryList,
        getEntriesByName: () => filteredEntries as PerformanceEntryList,
        getEntriesByType: () => filteredEntries as PerformanceEntryList,
      },
      performanceObserver
    )
  }

  return {
    notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => {
      bufferedEntries.push(...entries)
      instances.forEach((instance) => notify(instance, entries))
    },
  }
}

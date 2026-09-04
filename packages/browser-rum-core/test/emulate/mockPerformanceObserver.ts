import { registerCleanupTask } from '@datadog/browser-core/test'
import { objectValues } from '@datadog/browser-core'
import { RumPerformanceEntryType, type RumPerformanceEntry } from '../../src/browser/performanceObservable'
import { mockGlobalPerformanceBuffer } from './mockGlobalPerformanceBuffer'

export function mockPerformanceObserver({ supportedEntryTypes = objectValues(RumPerformanceEntryType) } = {}) {
  const originalPerformanceObserver = window.PerformanceObserver
  const instances = new Set<MockPerformanceObserver>()

  const { addPerformanceEntry } = mockGlobalPerformanceBuffer([])

  class MockPerformanceObserver {
    static supportedEntryTypes = supportedEntryTypes

    public entryTypes: string[] = []

    constructor(public callback: PerformanceObserverCallback) {}

    disconnect() {
      instances.delete(this)
    }

    observe({ entryTypes, type, buffered }: PerformanceObserverInit) {
      this.entryTypes = entryTypes || (type ? [type] : [])
      instances.add(this)
      if (buffered) {
        for (const entryType of this.entryTypes) {
          notify(this, performance.getEntriesByType(entryType) as RumPerformanceEntry[])
        }
      }
    }

    takeRecords() {
      return []
    }
  }

  window.PerformanceObserver = MockPerformanceObserver

  registerCleanupTask(() => {
    window.PerformanceObserver = originalPerformanceObserver
    instances.clear()
  })

  function notify(observer: MockPerformanceObserver, entries: RumPerformanceEntry[]) {
    const filteredEntries = entries.filter((entry) => observer.entryTypes.includes(entry.entryType))
    if (!filteredEntries.length) {
      return
    }
    observer.callback(
      {
        getEntries: () => filteredEntries as PerformanceEntryList,
        getEntriesByName: () => filteredEntries as PerformanceEntryList,
        getEntriesByType: () => filteredEntries as PerformanceEntryList,
      },
      observer
    )
  }

  return {
    notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => {
      for (const entry of entries) {
        addPerformanceEntry(entry as PerformanceEntry)
      }
      instances.forEach((instance) => notify(instance, entries))
    },
    // Number of PerformanceObserver instances currently observing `entryType`. Useful to verify a
    // subscription was actually torn down (disconnect() removes the instance from the set), not
    // just that its callback happens to produce no visible effect.
    activeObserverCount: (entryType: RumPerformanceEntryType) =>
      Array.from(instances).filter((instance) => instance.entryTypes.includes(entryType)).length,
  }
}

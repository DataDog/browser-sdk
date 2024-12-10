import { registerCleanupTask } from '@datadog/browser-core/test'
import { objectValues } from '@datadog/browser-core'
import { RumPerformanceEntryType, type RumPerformanceEntry } from '../../src/browser/performanceObservable'

export function mockPerformanceObserver({ typeSupported = true, emulateAllEntryTypesUnsupported = false } = {}) {
  const originalPerformanceObserver = window.PerformanceObserver
  const instances = new Set<MockPerformanceObserver>()
  let bufferedEntries: RumPerformanceEntry[] = []

  class MockPerformanceObserver {
    static supportedEntryTypes = objectValues(RumPerformanceEntryType)

    public entryTypes: string[] = []

    constructor(public callback: PerformanceObserverCallback) {}

    disconnect() {
      instances.delete(this)
    }

    observe({ entryTypes, type, buffered }: PerformanceObserverInit) {
      if (!typeSupported && type) {
        throw new TypeError("Failed to execute 'observe' on 'PerformanceObserver")
      }
      if (emulateAllEntryTypesUnsupported) {
        throw new TypeError('entryTypes contained only unsupported types')
      }
      this.entryTypes = entryTypes || (type ? [type] : [])
      instances.add(this)
      if (buffered) {
        notify(this, bufferedEntries)
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
    bufferedEntries = []
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
      bufferedEntries.push(...entries)
      instances.forEach((instance) => notify(instance, entries))
    },
  }
}

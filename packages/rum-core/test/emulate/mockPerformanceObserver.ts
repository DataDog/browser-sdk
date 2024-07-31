import { registerCleanupTask } from '@datadog/browser-core/test'
import { includes, objectValues } from '@datadog/browser-core'
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
    const filteredEntries = entries.filter((entry) => includes(observer.entryTypes, entry.entryType))
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

export function mockPerformanceTiming() {
  const timings = {
    domComplete: 456,
    domContentLoadedEventEnd: 345,
    domContentLoadedEventStart: 0,
    domInteractive: 234,
    loadEventEnd: 567,
    loadEventStart: 567,
    responseStart: 123,
    unloadEventEnd: 0,
    unloadEventStart: 0,
  } as typeof performance.timing
  const properties = Object.keys(timings) as Array<keyof typeof performance.timing>

  for (const propertyName of properties) {
    spyOnProperty(performance.timing, propertyName, 'get').and.callFake(() => timings[propertyName])
  }
}

import { registerCleanupTask } from '@datadog/browser-core/test'
import { includes, objectValues } from '@datadog/browser-core'
import { RumPerformanceEntryType, type RumPerformanceEntry } from '../../src/browser/performanceObservable'

type PerformanceObserverInstance = {
  callback: PerformanceObserverCallback
  entryTypes: string[]
}

export function mockPerformanceObserver({ typeSupported = true, emulateAllEntryTypesUnsupported = false } = {}) {
  const originalPerformanceObserver = window.PerformanceObserver
  const instances = new Set<PerformanceObserverInstance>()
  let performanceObserver: PerformanceObserver
  let bufferedEntries: RumPerformanceEntry[] = []

  const mock = (callback: PerformanceObserverCallback) => {
    const instance = { callback, entryTypes: [] as string[] }

    performanceObserver = {
      disconnect() {
        instances.delete(instance)
      },
      observe({ entryTypes, type, buffered }: PerformanceObserverInit) {
        if (!typeSupported && type) {
          throw new TypeError("Failed to execute 'observe' on 'PerformanceObserver")
        }
        if (emulateAllEntryTypesUnsupported) {
          throw new TypeError('entryTypes contained only unsupported types')
        }
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
  }

  mock.supportedEntryTypes = objectValues(RumPerformanceEntryType)
  mock.supportedEntryTypes.includes = (entryType) => includes(mock.supportedEntryTypes, entryType)

  window.PerformanceObserver = mock as unknown as typeof window.PerformanceObserver

  registerCleanupTask(() => {
    window.PerformanceObserver = originalPerformanceObserver
    instances.clear()
    bufferedEntries = []
  })

  function notify({ callback, entryTypes }: PerformanceObserverInstance, entries: RumPerformanceEntry[]) {
    const filteredEntries = entries.filter((entry) => includes(entryTypes, entry.entryType))
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

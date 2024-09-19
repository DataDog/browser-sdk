import { monitor, setTimeout, addEventListener, objectHasValue } from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { BrowserWindow, RumLayoutShiftTiming } from './performanceObservable'
import { RumPerformanceEntryType } from './performanceObservable'

function supportPerformanceObject() {
  return window.performance !== undefined && 'getEntries' in performance
}

export type CollectionRumPerformanceEntry = RumLayoutShiftTiming

export function startPerformanceCollection(lifeCycle: LifeCycle, configuration: RumConfiguration) {
  const cleanupTasks: Array<() => void> = []

  if (supportPerformanceObject()) {
    const performanceEntries = performance.getEntries()
    // Because the performance entry list can be quite large
    // delay the computation to prevent the SDK from blocking the main thread on init
    setTimeout(() => handleRumPerformanceEntries(lifeCycle, performanceEntries))
  }

  if (window.PerformanceObserver) {
    const handlePerformanceEntryList = monitor((entries: PerformanceObserverEntryList) =>
      handleRumPerformanceEntries(lifeCycle, entries.getEntries())
    )
    const experimentalEntries = [RumPerformanceEntryType.LAYOUT_SHIFT]

    try {
      // Experimental entries are not retrieved by performance.getEntries()
      // use a single PerformanceObserver with buffered flag by type
      // to get values that could happen before SDK init
      experimentalEntries.forEach((type) => {
        const observer = new (window as BrowserWindow).PerformanceObserver(handlePerformanceEntryList)
        observer.observe({
          type,
          buffered: true,
        })
        cleanupTasks.push(() => observer.disconnect())
      })
    } catch (e) {
      // Some old browser versions (ex: chrome 67) don't support the PerformanceObserver type and buffered options
      // In these cases, fallback to PerformanceObserver with entryTypes
      const mainObserver = new PerformanceObserver(handlePerformanceEntryList)
      try {
        mainObserver.observe({ entryTypes: experimentalEntries })
        cleanupTasks.push(() => mainObserver.disconnect())
      } catch {
        // Old versions of Safari are throwing "entryTypes contained only unsupported types"
        // errors when observing only unsupported entry types.
        //
        // We could use `supportPerformanceTimingEvent` to make sure we don't invoke
        // `observer.observe` with an unsupported entry type, but Safari 11 and 12 don't support
        // `Performance.supportedEntryTypes`, so doing so would lose support for these versions
        // even if they do support the entry type.
      }
    }

    if (supportPerformanceObject() && 'addEventListener' in performance) {
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1559377
      const { stop: removePerformanceListener } = addEventListener(
        configuration,
        performance,
        'resourcetimingbufferfull',
        () => {
          performance.clearResourceTimings()
        }
      )
      cleanupTasks.push(removePerformanceListener)
    }
  }

  return {
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
  }
}

function handleRumPerformanceEntries(
  lifeCycle: LifeCycle,
  entries: Array<PerformanceEntry | CollectionRumPerformanceEntry>
) {
  const rumPerformanceEntries = entries.filter((entry): entry is CollectionRumPerformanceEntry =>
    objectHasValue(RumPerformanceEntryType, entry.entryType)
  )

  if (rumPerformanceEntries.length) {
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, rumPerformanceEntries)
  }
}

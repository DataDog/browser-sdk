type PerformanceEntryStartTimeMs = number

// Maps PerformanceEntry start-time to the corresponding long task id (from RUM LongTaskEvent),
// We need this to link RUM Long Tasks with RUM Profiler stack traces
// Given that long task takes at least 50ms and we export profile at least every 60 seconds, we can have up to 1200 entries (60s / 50ms = 1200).
const registry = new Map<PerformanceEntryStartTimeMs, string>()

// Enable Long Task Registry only if RUM Profiler has been activated
let enabledTime: false | number = false

export function enableLongTaskRegistry() {
  enabledTime = performance.now()
}

export function disableLongTaskRegistry() {
  enabledTime = false
  registry.clear() // Free-up the memory
}

/**
 * Store the long task ID in the registry for the Profiler to link it with the corresponding Profile.
 */
export function setLongTaskId(longTaskId: string, performanceEntryStartTime: number) {
  registry.set(performanceEntryStartTime, longTaskId)
}

export function getLongTaskId(longTaskEntry: PerformanceEntry): string | undefined {
  // Don't return if it's not enabled or the long task has been reported before the activation
  if (enabledTime === false || longTaskEntry.startTime < enabledTime) {
    return undefined
  }

  return registry.get(longTaskEntry.startTime)
}

export function deleteLongTaskIdsBefore(collectionTime: number) {
  if (enabledTime === false || collectionTime < enabledTime) {
    return undefined
  }

  for (const performanceEntryStartTime of registry.keys()) {
    if (performanceEntryStartTime < collectionTime) {
      registry.delete(performanceEntryStartTime)
    }
  }
}

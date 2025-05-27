import type { RelativeTime } from '@datadog/browser-core'

type PerformanceEntryStartTime = RelativeTime

// Maps PerformanceEntry start-time to the corresponding long task id (from RUM LongTaskEvent),
// We need this to link RUM Long Tasks with RUM Profiler stack traces
// Given that long task takes at least 50ms and we export profile at least every 60 seconds, we can have up to 1200 entries (60s / 50ms = 1200).
const registry = new Map<PerformanceEntryStartTime, string>()

export function disableLongTaskRegistry() {
  registry.clear() // Free-up the memory
}

/**
 * Store the long task ID in the registry for the Profiler to link it with the corresponding Profile.
 */
export function setLongTaskId(longTaskId: string, startTime: PerformanceEntryStartTime) {
  registry.set(startTime, longTaskId)
}

export function getLongTaskId(startTime: PerformanceEntryStartTime): string | undefined {
  return registry.get(startTime)
}

/**
 * Delete the Long Task from the registry once we have collected it.
 *
 * @param collectionRelativeTime The relative time of the collection
 */
export function cleanupLongTaskRegistryAfterCollection(collectionRelativeTime: RelativeTime) {
  for (const performanceStartTime of registry.keys()) {
    if (performanceStartTime < collectionRelativeTime) {
      // We collected this Long Task already, no need to keep it in the registry.
      registry.delete(performanceStartTime)
    }
  }
}

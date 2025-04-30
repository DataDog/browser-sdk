import type { ClocksState, RelativeTime } from '@datadog/browser-core'
import { clocksNow } from '@datadog/browser-core'

type PerformanceEntryStartTimeMs = number

// Maps PerformanceEntry start-time to the corresponding long task id (from RUM LongTaskEvent),
// We need this to link RUM Long Tasks with RUM Profiler stack traces
// Given that long task takes at least 50ms and we export profile at least every 60 seconds, we can have up to 1200 entries (60s / 50ms = 1200).
const registry = new Map<PerformanceEntryStartTimeMs, string>()

// Enable Long Task Registry only if RUM Profiler has been activated
let enabledClocks: false | ClocksState = false

export function enableLongTaskRegistry() {
  enabledClocks = clocksNow()
}

export function disableLongTaskRegistry() {
  enabledClocks = false
  registry.clear() // Free-up the memory
}

/**
 * Store the long task ID in the registry for the Profiler to link it with the corresponding Profile.
 */
export function setLongTaskId(longTaskId: string, startTime: RelativeTime) {
  registry.set(startTime, longTaskId)
}

export function getLongTaskId(longTaskEntry: { startClocks: ClocksState }): string | undefined {
  // Don't return if it's not enabled or the long task has been reported before the activation
  if (enabledClocks === false || longTaskEntry.startClocks.timeStamp < enabledClocks.timeStamp) {
    return undefined
  }

  return registry.get(longTaskEntry.startClocks.relative)
}

export function deleteLongTaskIdsBefore(collectionClocks: ClocksState) {
  if (enabledClocks === false || collectionClocks.timeStamp < enabledClocks.timeStamp) {
    return undefined
  }

  for (const performanceEntryStartTime of registry.keys()) {
    if (performanceEntryStartTime < collectionClocks.relative) {
      registry.delete(performanceEntryStartTime)
    }
  }
}

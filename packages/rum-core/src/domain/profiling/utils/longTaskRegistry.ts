

import { createLruCache } from './lruCache/lruCache';

type PerformanceEntryStartTimeMs = number;
// Maps PerformanceEntry start-time to the corresponding long task ID
// We need this to link RUM Long Tasks with RUM Profiler stack traces
// Given that long task takes at least 50ms and we export profile at least every 60 seconds, we can have up to 1200 entries (60s / 50ms = 1200).
// eslint-disable-next-line local-rules/disallow-side-effects
const registry = createLruCache<PerformanceEntryStartTimeMs, string>(1200);
// Enable Long Task Registry only if RUM Profiler has been activated
let enabledTime: false | number = false;

export function enableLongTaskRegistry() {
    enabledTime = performance.now();
}

export function disableLongTaskRegistry() {
    enabledTime = false;
    registry.clear(); // Free-up the memory
}

/**
 * Store the long task ID in the registry for the Profiler to link it with the corresponding Profile.
 */
export function setLongTaskId(longTaskId: string, performanceEntryStartTime: number) {
    registry.set(performanceEntryStartTime, longTaskId);
}

export function getLongTaskId(longTaskEntry: PerformanceEntry): string | undefined {
    // Don't return if it's not enabled or the long task has been reported before the activation
    if (enabledTime === false || longTaskEntry.startTime < enabledTime) {
        return undefined;
    }

    const id = registry.get(longTaskEntry.startTime);

    return id;
}


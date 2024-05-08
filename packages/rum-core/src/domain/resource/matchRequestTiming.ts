import type { Duration, RelativeTime } from '@datadog/browser-core'
import { addDuration } from '@datadog/browser-core'
import type { RumPerformanceResourceTiming } from '../../browser/performanceCollection'
import type { RequestCompleteEvent } from '../requestCollection'
import { isValidEntry } from './resourceUtils'

interface Timing {
  startTime: RelativeTime
  duration: Duration
}

// we use a WeakMap because WeakSet is not supported in ie11
const PLACEHOLDER = 1
const matchedResourceTimingEntries = new WeakMap<PerformanceEntry, typeof PLACEHOLDER>()

/**
 * Look for corresponding timing in resource timing buffer
 *
 * Observations:
 * - Timing (start, end) are nested inside the request (start, end)
 * - Some timing can be not exactly nested, being off by < 1 ms
 *
 * Strategy:
 * - from valid nested entries (with 1 ms error margin)
 * - if a single timing match, return the timing
 * - otherwise we can't decide, return undefined
 */
export function matchRequestTiming(request: RequestCompleteEvent) {
  if (!performance || !('getEntriesByName' in performance)) {
    return
  }
  const sameNameEntries = performance.getEntriesByName(request.url, 'resource')

  if (!sameNameEntries.length || !('toJSON' in sameNameEntries[0])) {
    return
  }

  const candidates = sameNameEntries
    .filter((entry) => !matchedResourceTimingEntries.has(entry))
    .map((entry) => ({
      original: entry,
      serialized: entry.toJSON() as RumPerformanceResourceTiming,
    }))
    .filter((entry) => isValidEntry(entry.serialized))
    .filter((entry) =>
      isBetween(
        entry.serialized,
        request.startClocks.relative,
        endTime({ startTime: request.startClocks.relative, duration: request.duration })
      )
    )

  if (candidates.length === 1) {
    matchedResourceTimingEntries.set(candidates[0].original, PLACEHOLDER)

    return candidates[0].serialized
  }

  return
}

function endTime(timing: Timing) {
  return addDuration(timing.startTime, timing.duration)
}

function isBetween(timing: Timing, start: RelativeTime, end: RelativeTime) {
  const errorMargin = 1 as Duration
  return timing.startTime >= start - errorMargin && endTime(timing) <= addDuration(end, errorMargin)
}

import type { Duration, RelativeTime } from '@datadog/browser-core'
import { addDuration } from '@datadog/browser-core'
import type { RumPerformanceResourceTiming } from '../../browser/performanceCollection'
import type { RequestCompleteEvent } from '../requestCollection'
import { WeakSet } from '../../browser/polyfills'
import { isValidEntry } from './resourceUtils'

interface Timing {
  startTime: RelativeTime
  duration: Duration
}

const alreadyMatchedEntries = new WeakSet<PerformanceEntry>()

/**
 * Look for corresponding timing in resource timing buffer
 *
 * Observations:
 * - Timing (start, end) are nested inside the request (start, end)
 * - Some timing can be not exactly nested, being off by < 1 ms
 *
 * Strategy:
 * - from valid nested entries (with 1 ms error margin)
 * - filter out timing that were already matched to a request
 * - then, if a single timing match, return the timing
 * - otherwise we can't decide, return undefined
 */
export function matchRequestTiming(request: RequestCompleteEvent) {
  if (!performance || !('getEntriesByName' in performance)) {
    return
  }
  const sameNameEntries = performance.getEntriesByName(request.url, 'resource') as RumPerformanceResourceTiming[]

  if (!sameNameEntries.length || !('toJSON' in sameNameEntries[0])) {
    return
  }

  const candidates = sameNameEntries
    .filter((entry) => !alreadyMatchedEntries.has(entry))
    .filter((entry) => isValidEntry(entry))
    .filter((entry) =>
      isBetween(
        entry,
        request.startClocks.relative,
        endTime({ startTime: request.startClocks.relative, duration: request.duration })
      )
    )

  if (candidates.length === 1) {
    alreadyMatchedEntries.add(candidates[0])

    return candidates[0].toJSON() as RumPerformanceResourceTiming
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

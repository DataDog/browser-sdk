import type { Duration, RelativeTime } from '@datadog/browser-core'
import { addDuration } from '@datadog/browser-core'
import type { RumPerformanceResourceTiming } from '../../../browser/performanceCollection'
import type { RequestCompleteEvent } from '../../requestCollection'
import { toValidEntry } from './resourceUtils'

interface Timing {
  startTime: RelativeTime
  duration: Duration
}

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
    .map((entry) => entry.toJSON() as RumPerformanceResourceTiming)
    .filter(toValidEntry)
    .filter((entry) =>
      isBetween(
        entry,
        request.startClocks.relative,
        endTime({ startTime: request.startClocks.relative, duration: request.duration })
      )
    )

  if (candidates.length === 1) {
    return candidates[0]
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

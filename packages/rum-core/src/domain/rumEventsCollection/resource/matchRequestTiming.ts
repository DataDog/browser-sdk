import { Duration, RelativeTime } from '@datadog/browser-core'
import { RumPerformanceResourceTiming } from '../../../browser/performanceCollection'
import { RequestCompleteEvent } from '../../requestCollection'
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
 * - Browsers generate a timing entry for OPTIONS request
 *
 * Strategy:
 * - from valid nested entries
 * - if a single timing match, return the timing
 * - if two following timings match (OPTIONS request), return the timing for the actual request
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
    .filter((entry) => isBetween(entry, request.startTime, endTime(request)))

  if (candidates.length === 1) {
    return candidates[0]
  }

  if (candidates.length === 2 && firstCanBeOptionRequest(candidates)) {
    return candidates[1]
  }

  return
}

function firstCanBeOptionRequest(correspondingEntries: RumPerformanceResourceTiming[]) {
  return endTime(correspondingEntries[0]) <= correspondingEntries[1].startTime
}

function endTime(timing: Timing) {
  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
  return (timing.startTime + timing.duration) as RelativeTime
}

function isBetween(timing: Timing, start: RelativeTime, end: RelativeTime) {
  return timing.startTime >= start && endTime(timing) <= end
}

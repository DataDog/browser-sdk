import { RumPerformanceResourceTiming } from '../../../browser/performanceCollection'
import { RequestCompleteEvent } from '../../requestCollection'
import { toValidEntry } from './resourceUtils'

interface Timing {
  startTime: number
  duration: number
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
    return {}
  }
  const candidates = performance
    .getEntriesByName(request.url, 'resource')
    .map((entry) => entry.toJSON() as RumPerformanceResourceTiming)
    .filter(toValidEntry)
    .filter((entry) => isBetween(entry, request.startTime, endTime(request)))

  let result

  if (candidates.length === 1) {
    result = candidates[0]
  }

  if (candidates.length === 2 && firstCanBeOptionRequest(candidates)) {
    result = candidates[1]
  }

  return {
    candidate: result,
    debug: {
      candidates: candidates.map((c) => ({ startTime: c.startTime, duration: c.duration })),
      matchesNb: candidates.length,
      request: { startTime: request.startTime, duration: request.duration },
      result: result && { startTime: result.startTime, duration: result.duration },
      resultDiff: result && request.duration - result.duration,
    },
  }
}

function firstCanBeOptionRequest(correspondingEntries: RumPerformanceResourceTiming[]) {
  return endTime(correspondingEntries[0]) <= correspondingEntries[1].startTime
}

function endTime(timing: Timing) {
  return timing.startTime + timing.duration
}

function isBetween(timing: Timing, start: number, end: number) {
  return timing.startTime >= start && endTime(timing) <= end
}

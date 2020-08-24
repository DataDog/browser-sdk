import { RumPerformanceResourceTiming } from './performanceCollection'
import { RequestCompleteEvent } from './requestCollection'

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
 * - if a single timing match, return the timing
 * - if two following timings match (OPTIONS request), return the timing for the actual request
 * - otherwise we can't decide, return undefined
 */
export function matchRequestTiming(request: RequestCompleteEvent) {
  if (!performance || !('getEntriesByName' in performance)) {
    return
  }
  const candidates = (performance
    .getEntriesByName(request.url, 'resource')
    .filter((entry) =>
      isBetween(entry, request.startTime, endTime(request))
    ) as unknown) as RumPerformanceResourceTiming[]

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
  return timing.startTime + timing.duration
}

function isBetween(timing: Timing, start: number, end: number) {
  return timing.startTime >= start && endTime(timing) <= end
}

import { RequestDetails } from '../core/requestCollection'

interface Timing {
  startTime: number
  duration: number
}

/**
 * Look for corresponding timing in resource timing buffer
 * Observations:
 * - Timing (start, end) are nested inside the request (start, end)
 * - Timing for OPTIONS request can be retrieved with the actual timing request
 * - Multiple timings can be retrieved when there are concurrent requests
 */
export function matchRequestTiming(requestDetails: RequestDetails) {
  if (!performance || !('getEntriesByName' in performance)) {
    return
  }
  const candidates = performance
    .getEntriesByName(requestDetails.url, 'resource')
    .filter((entry) =>
      isBetween(entry, requestDetails.startTime, endTime(requestDetails))
    ) as PerformanceResourceTiming[]

  if (candidates.length === 1) {
    return candidates[0]
  }

  if (candidates.length === 2 && firstCanBeOptionRequest(candidates)) {
    return candidates[1]
  }

  return
}

function firstCanBeOptionRequest(correspondingEntries: PerformanceResourceTiming[]) {
  return endTime(correspondingEntries[0]) <= correspondingEntries[1].startTime
}

function endTime(timing: Timing) {
  return timing.startTime + timing.duration
}

function isBetween(timing: Timing, start: number, end: number) {
  return timing.startTime >= start && endTime(timing) <= end
}

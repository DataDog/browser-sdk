import type { RumPerformanceResourceTiming } from './matchResponseToPerformanceEntry'

import { assign } from './utils'

export function toValidEntry(entry: RumPerformanceResourceTiming) {
  // Ensure timings are in the right order. On top of filtering out potential invalid
  // RumPerformanceResourceTiming, it will ignore entries from requests where timings cannot be
  // collected, for example cross origin requests without a "Timing-Allow-Origin" header allowing
  // it.
  if (
    !areInOrder(
      entry.startTime,
      entry.fetchStart,
      entry.domainLookupStart,
      entry.domainLookupEnd,
      entry.connectStart,
      entry.connectEnd,
      entry.requestStart,
      entry.responseStart,
      entry.responseEnd
    )
  ) {
    return undefined
  }

  if (!hasRedirection(entry)) {
    return entry
  }

  let { redirectStart, redirectEnd } = entry
  // Firefox doesn't provide redirect timings on cross origin requests.
  // Provide a default for those.
  if (redirectStart < entry.startTime) {
    redirectStart = entry.startTime
  }
  if (redirectEnd < entry.startTime) {
    redirectEnd = entry.fetchStart
  }

  // Make sure redirect timings are in order
  if (!areInOrder(entry.startTime, redirectStart, redirectEnd, entry.fetchStart)) {
    return undefined
  }

  return assign({}, entry, {
    redirectEnd,
    redirectStart,
  })
}

export function areInOrder(...numbers: number[]) {
  for (let i = 1; i < numbers.length; i += 1) {
    if (numbers[i - 1] > numbers[i]) {
      return false
    }
  }
  return true
}

export function hasRedirection(entry: RumPerformanceResourceTiming) {
  // The only time fetchStart is different than startTime is if a redirection occurred.
  return entry.fetchStart !== entry.startTime
}

import type { Duration, RelativeTime } from '@datadog/browser-core'
import { RequestType } from '@datadog/browser-core'
import type { RequestCompleteEvent } from '../../requestCollection'
import type { RumPerformanceResourceTiming } from '../../../browser/performanceCollection'

interface Timing {
  startTime: RelativeTime
  duration: Duration
}

export const filterEntries = (
  entries: PerformanceEntry[],
  request: RequestCompleteEvent
): RumPerformanceResourceTiming[] =>
  entries
    .map((entry) => {
      const entryJson = (entry.toJSON && entry.toJSON()) || entry
      return entryJson as RumPerformanceResourceTiming
    })
    .filter((entry) =>
      (request.type === RequestType.XHR && entry.initiatorType === 'xmlhttprequest') ||
      (request.type === RequestType.FETCH && entry.initiatorType === 'fetch')
        ? true
        : false
    )
    .filter((entry) => request.url === entry.name)
    .filter((entry) => isAfter(entry, request.startClocks.relative))

function isAfter(timing: Timing, start: RelativeTime) {
  const errorMargin = 1 as Duration
  return timing.startTime >= start - errorMargin
}

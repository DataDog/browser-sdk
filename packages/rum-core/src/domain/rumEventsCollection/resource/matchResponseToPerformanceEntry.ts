import type { RelativeTime, Duration, ClocksState } from '@datadog/browser-core'
import { addDuration, elapsed, timeStampNow } from '@datadog/browser-core'
import type { RequestCompleteEvent } from '../../requestCollection'
import { toValidEntry } from './resourceUtils'

export interface RumPerformanceResourceTiming {
  entryType: 'resource'
  initiatorType: string
  name: string
  startTime: RelativeTime
  duration: Duration
  fetchStart: RelativeTime
  domainLookupStart: RelativeTime
  domainLookupEnd: RelativeTime
  connectStart: RelativeTime
  secureConnectionStart: RelativeTime
  connectEnd: RelativeTime
  requestStart: RelativeTime
  responseStart: RelativeTime
  responseEnd: RelativeTime
  redirectStart: RelativeTime
  redirectEnd: RelativeTime
  decodedBodySize: number
  traceId?: string
}

export const matchOnPerformanceObserverCallback = (
  request: RequestCompleteEvent
): Promise<RumPerformanceResourceTiming | undefined> => {
  let observer: PerformanceObserver | undefined
  return (
    new Promise((resolve) => {
      observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const filteredEntries = entries.filter((entry) => entry.name === request.url)
        const candidates = filterCandidateEntries(filteredEntries, request.startClocks)
        if (candidates.length) {
          // log that there is an issue
          if (candidates.length > 2) resolve(undefined)
          if (candidates.length === 2 && firstCanBeOptionRequest(candidates)) resolve(candidates[1])
          if (candidates.length === 1) resolve(candidates[0])
        }
      })
      observer.observe({ entryTypes: ['resource'] })
    })
      // @ts-ignore: if a browser supports fetch, it likely supports finally
      .finally(reset)
  )

  function reset() {
    observer && observer.disconnect()
    observer = undefined
  }
}

interface Timing {
  startTime: RelativeTime
  duration: Duration
}

function firstCanBeOptionRequest(correspondingEntries: RumPerformanceResourceTiming[]) {
  return endTime(correspondingEntries[0]) <= correspondingEntries[1].startTime
}

function endTime(timing: Timing) {
  return addDuration(timing.startTime, timing.duration)
}

function isBetween(timing: Timing, start: RelativeTime, end: RelativeTime) {
  const errorMargin = 1 as Duration
  return timing.startTime >= start - errorMargin && endTime(timing) <= addDuration(end, errorMargin)
}

const filterCandidateEntries = (entries: PerformanceEntryList, startClocks: ClocksState) =>
  entries
    .map((entry) => entry.toJSON() as RumPerformanceResourceTiming)
    .filter(toValidEntry)
    .filter((entry) =>
      isBetween(
        entry,
        startClocks.relative,
        endTime({
          startTime: startClocks.relative,
          duration: elapsed(startClocks.timeStamp, timeStampNow()),
        })
      )
    )

export const matchOnPerformanceGetEntriesByName = (
  request: RequestCompleteEvent
): RumPerformanceResourceTiming | undefined => {
  const entries = performance.getEntriesByName(request.url, 'resource')
  const candidates = filterCandidateEntries(entries, request.startClocks)

  if (candidates.length > 2) return undefined
  if (candidates.length === 2 && firstCanBeOptionRequest(candidates)) return candidates[1]
  if (candidates.length === 1) return candidates[0]
  return undefined
}

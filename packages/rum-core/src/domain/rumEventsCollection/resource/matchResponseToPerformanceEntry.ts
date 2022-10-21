import type { RelativeTime, Duration, ClocksState } from '@datadog/browser-core'
import { addDuration, monitor } from '@datadog/browser-core'
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

export const REPORT_FETCH_TIMER = 5000

export const matchOnPerformanceObserverCallback = (
  request: RequestCompleteEvent
): Promise<RumPerformanceResourceTiming | undefined> => {
  let timeOutId: null | number = null
  return (
    Promise.race([
      new Promise((resolve) => {
        const observer = new PerformanceObserver((list, observer) => {
          const entries = list.getEntries()
          const candidates = filterCandidateEntries(entries, request.url, request.duration, request.startClocks)
          if (candidates.length) {
            if (candidates.length > 1) {
              // log that there is an issue
            }
            resolve(candidates[candidates.length - 1])
            observer.disconnect()
          }
        })
        observer.observe({ entryTypes: ['resource'], buffered: true })
      }),
      new Promise((resolve) => {
        timeOutId = setTimeout(
          monitor(() => {
            const entity = matchOnPerformanceGetEntriesByName(request)
            resolve(entity)
          }),
          REPORT_FETCH_TIMER
        )
      }),
    ])
      // @ts-ignore: if a browser supports fetch, it likely supports finally
      .finally(reset)
  )

  function reset() {
    timeOutId && clearTimeout(timeOutId)
    timeOutId = null
  }
}

interface Timing {
  startTime: RelativeTime
  duration: Duration
}

function endTime(timing: Timing) {
  return addDuration(timing.startTime, timing.duration)
}

function isBetween(timing: Timing, start: RelativeTime, end: RelativeTime) {
  const errorMargin = 1 as Duration
  return timing.startTime >= start - errorMargin && endTime(timing) <= addDuration(end, errorMargin)
}

const filterCandidateEntries = (
  entries: PerformanceEntryList,
  url: string,
  duration: Duration,
  startClocks: ClocksState
) =>
  entries
    .map((entry) => entry.toJSON() as RumPerformanceResourceTiming)
    .filter(toValidEntry)
    .filter((entry) => entry.name === url)
    .filter((entry) =>
      isBetween(
        { startTime: entry.startTime, duration },
        startClocks.relative,
        endTime({ startTime: startClocks.relative, duration })
      )
    )

export const matchOnPerformanceGetEntriesByName = (request: RequestCompleteEvent) => {
  const entries = performance.getEntriesByName(request.url, 'resource')
  const candidates = filterCandidateEntries(entries, request.url, request.duration, request.startClocks)

  if (candidates.length > 1) {
    // log that there is an issue
  }
  return candidates[candidates.length - 1]
}

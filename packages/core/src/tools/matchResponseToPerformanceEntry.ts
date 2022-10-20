import { toValidEntry } from './resourceUtils'
import type { RelativeTime, Duration, ClocksState } from './timeUtils'
import { addDuration } from './timeUtils'
import { monitor } from './monitor'

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

export const matchResponseToPerformanceEntry = (
  response: Response,
  duration: Duration,
  startClocks: ClocksState
): Promise<RumPerformanceResourceTiming | undefined> => {
  let timeOutId: null | number = null
  return (
    Promise.race([
      new Promise((resolve) => {
        const observer = new PerformanceObserver((list, observer) => {
          const entries = list.getEntries() as unknown as RumPerformanceResourceTiming[]
          entries
            .filter(toValidEntry)
            .filter((entry) => entry.initiatorType === 'fetch')
            .filter((entry) => entry.name === response?.url)
            .filter((entry) =>
              isBetween(
                { startTime: entry.startTime, duration },
                startClocks.relative,
                endTime({ startTime: startClocks.relative, duration })
              )
            )

          if (entries.length) {
            observer.disconnect()
            // TODO: if entries.length > 1 then we should report
            resolve(entries[-1])
          }
        })
        observer.observe({ entryTypes: ['resource'] })
      }),
      new Promise((resolve) => {
        timeOutId = setTimeout(
          monitor(() => {
            resolve(undefined)
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

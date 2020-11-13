import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'

export interface Timings {
  firstContentfulPaint?: number
  domInteractive?: number
  domContentLoaded?: number
  domComplete?: number
  loadEventEnd?: number
}

export function trackTimings(lifeCycle: LifeCycle, callback: (timings: Timings) => void) {
  let timings: Timings | undefined
  const { unsubscribe: stopPerformanceTracking } = lifeCycle.subscribe(
    LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
    (entry) => {
      if (entry.entryType === 'navigation') {
        timings = {
          ...timings,
          domComplete: entry.domComplete,
          domContentLoaded: entry.domContentLoadedEventEnd,
          domInteractive: entry.domInteractive,
          loadEventEnd: entry.loadEventEnd,
        }
        callback(timings)
      } else if (entry.entryType === 'paint' && entry.name === 'first-contentful-paint') {
        timings = {
          ...timings,
          firstContentfulPaint: entry.startTime,
        }
        callback(timings)
      }
    }
  )
  return { stop: stopPerformanceTracking }
}

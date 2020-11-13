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
  function setTimings(newTimings: Partial<Timings>) {
    timings = { ...timings, ...newTimings }
    callback(timings)
  }

  const { stop: stopNavigationTracking } = trackNavigationTimings(lifeCycle, setTimings)
  const { stop: stopFCPTracking } = trackFirstContentfulPaint(lifeCycle, (firstContentfulPaint) =>
    setTimings({ firstContentfulPaint })
  )

  return {
    stop() {
      stopNavigationTracking()
      stopFCPTracking()
    },
  }
}

export function trackNavigationTimings(lifeCycle: LifeCycle, callback: (newTimings: Partial<Timings>) => void) {
  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (entry.entryType === 'navigation') {
      callback({
        domComplete: entry.domComplete,
        domContentLoaded: entry.domContentLoadedEventEnd,
        domInteractive: entry.domInteractive,
        loadEventEnd: entry.loadEventEnd,
      })
    }
  })

  return { stop }
}

export function trackFirstContentfulPaint(lifeCycle: LifeCycle, callback: (fcp: number) => void) {
  const { unsubscribe: unsubscribeLifeCycle } = lifeCycle.subscribe(
    LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
    (entry) => {
      if (entry.entryType === 'paint' && entry.name === 'first-contentful-paint') {
        callback(entry.startTime)
      }
    }
  )
  return {
    stop() {
      unsubscribeLifeCycle()
    },
  }
}

import { addEventListeners, DOM_EVENT, EventEmitter } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { trackFirstHidden } from './trackFirstHidden'

export interface Timings {
  firstContentfulPaint?: number
  domInteractive?: number
  domContentLoaded?: number
  domComplete?: number
  loadEventEnd?: number
  largestContentfulPaint?: number
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
  const { stop: stopLCPTracking } = trackLargestContentfulPaint(lifeCycle, window, (largestContentfulPaint) => {
    setTimings({
      largestContentfulPaint,
    })
  })

  return {
    stop() {
      stopNavigationTracking()
      stopFCPTracking()
      stopLCPTracking()
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
  const firstHidden = trackFirstHidden()
  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (
      entry.entryType === 'paint' &&
      entry.name === 'first-contentful-paint' &&
      entry.startTime < firstHidden.timeStamp
    ) {
      callback(entry.startTime)
    }
  })
  return { stop }
}

export function trackLargestContentfulPaint(
  lifeCycle: LifeCycle,
  emitter: EventEmitter,
  callback: (value: number) => void
) {
  const firstHidden = trackFirstHidden()

  // Ignore entries that come after the first user interaction
  let firstInteractionTimestamp: number = Infinity
  const { stop: stopEventListener } = addEventListeners(
    emitter,
    [DOM_EVENT.POINTER_DOWN, DOM_EVENT.KEY_DOWN, DOM_EVENT.SCROLL],
    (event) => {
      firstInteractionTimestamp = event.timeStamp
    },
    { capture: true, once: true }
  )

  const { unsubscribe: unsubcribeLifeCycle } = lifeCycle.subscribe(
    LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
    (entry) => {
      if (
        entry.entryType === 'largest-contentful-paint' &&
        entry.startTime < firstInteractionTimestamp &&
        entry.startTime < firstHidden.timeStamp
      ) {
        callback(entry.startTime)
      }
    }
  )

  return {
    stop() {
      stopEventListener()
      unsubcribeLifeCycle()
    },
  }
}

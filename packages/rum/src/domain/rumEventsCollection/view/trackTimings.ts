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
  firstInputDelay?: number
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
  const { stop: stopFIDTracking } = trackFirstInputDelay(lifeCycle, (firstInputDelay) => {
    setTimings({
      firstInputDelay,
    })
  })

  return {
    stop() {
      stopNavigationTracking()
      stopFCPTracking()
      stopLCPTracking()
      stopFIDTracking()
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

/**
 * Track the largest contentful paint (LCP) occuring during the initial View.  This can yield
 * multiple values, only the most recent one should be used.
 * Documentation: https://web.dev/lcp/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/master/src/getLCP.ts
 */
export function trackLargestContentfulPaint(
  lifeCycle: LifeCycle,
  emitter: EventEmitter,
  callback: (value: number) => void
) {
  const firstHidden = trackFirstHidden()

  // Ignore entries that come after the first user interaction.  According to the documentation, the
  // browser should not send largest-contentful-paint entries after a user interact with the page,
  // but the web-vitals reference implementation uses this as a safeguard.
  let firstInteractionTimestamp: number = Infinity
  const { stop: stopEventListener } = addEventListeners(
    emitter,
    [DOM_EVENT.POINTER_DOWN, DOM_EVENT.KEY_DOWN],
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

/**
 * Track the first input delay (FID) occuring during the initial View.  This yields at most one
 * value.
 * Documentation: https://web.dev/fid/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/master/src/getFID.ts
 */
export function trackFirstInputDelay(lifeCycle: LifeCycle, callback: (value: number) => void) {
  const firstHidden = trackFirstHidden()

  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (entry.entryType === 'first-input' && entry.startTime < firstHidden.timeStamp) {
      callback(entry.processingStart - entry.startTime)
    }
  })

  return {
    stop,
  }
}

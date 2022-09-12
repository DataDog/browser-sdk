import type { Duration, EventEmitter, RelativeTime } from '@datadog/browser-core'
import {
  assign,
  addEventListeners,
  DOM_EVENT,
  elapsed,
  ONE_MINUTE,
  find,
  findLast,
  relativeNow,
} from '@datadog/browser-core'

import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import type {
  RumFirstInputTiming,
  RumLargestContentfulPaintTiming,
  RumPerformancePaintTiming,
} from '../../../browser/performanceCollection'
import { trackFirstHidden } from './trackFirstHidden'

// Discard LCP and FCP timings above a certain delay to avoid incorrect data
// It happens in some cases like sleep mode or some browser implementations
export const TIMING_MAXIMUM_DELAY = 10 * ONE_MINUTE

export interface Timings {
  firstContentfulPaint?: Duration
  firstByte?: Duration
  domInteractive?: Duration
  domContentLoaded?: Duration
  domComplete?: Duration
  loadEvent?: Duration
  largestContentfulPaint?: Duration
  firstInputDelay?: Duration
  firstInputTime?: Duration
}

export function trackInitialViewTimings(lifeCycle: LifeCycle, callback: (timings: Timings) => void) {
  const timings: Timings = {}
  function setTimings(newTimings: Partial<Timings>) {
    assign(timings, newTimings)
    callback(timings)
  }

  const { stop: stopNavigationTracking } = trackNavigationTimings(lifeCycle, setTimings)
  const { stop: stopFCPTracking } = trackFirstContentfulPaintTiming(lifeCycle, (firstContentfulPaint) =>
    setTimings({ firstContentfulPaint })
  )
  const { stop: stopLCPTracking } = trackLargestContentfulPaintTiming(lifeCycle, window, (largestContentfulPaint) => {
    setTimings({
      largestContentfulPaint,
    })
  })
  const { stop: stopFIDTracking } = trackFirstInputTimings(lifeCycle, ({ firstInputDelay, firstInputTime }) => {
    setTimings({
      firstInputDelay,
      firstInputTime,
    })
  })

  return {
    stop: () => {
      stopNavigationTracking()
      stopFCPTracking()
      stopLCPTracking()
      stopFIDTracking()
    },
  }
}

export function trackNavigationTimings(lifeCycle: LifeCycle, callback: (timings: Partial<Timings>) => void) {
  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    for (const entry of entries) {
      if (entry.entryType === 'navigation') {
        callback({
          domComplete: entry.domComplete,
          domContentLoaded: entry.domContentLoadedEventEnd,
          domInteractive: entry.domInteractive,
          loadEvent: entry.loadEventEnd,
          // In some cases the value reported is negative or is larger
          // than the current page time. Ignore these cases:
          // https://github.com/GoogleChrome/web-vitals/issues/137
          // https://github.com/GoogleChrome/web-vitals/issues/162
          firstByte: entry.responseStart >= 0 && entry.responseStart <= relativeNow() ? entry.responseStart : undefined,
        })
      }
    }
  })

  return { stop }
}

export function trackFirstContentfulPaintTiming(lifeCycle: LifeCycle, callback: (fcpTiming: RelativeTime) => void) {
  const firstHidden = trackFirstHidden()
  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    const fcpEntry = find(
      entries,
      (entry): entry is RumPerformancePaintTiming =>
        entry.entryType === 'paint' &&
        entry.name === 'first-contentful-paint' &&
        entry.startTime < firstHidden.timeStamp &&
        entry.startTime < TIMING_MAXIMUM_DELAY
    )
    if (fcpEntry) {
      callback(fcpEntry.startTime)
    }
  })
  return { stop }
}

/**
 * Track the largest contentful paint (LCP) occurring during the initial View.  This can yield
 * multiple values, only the most recent one should be used.
 * Documentation: https://web.dev/lcp/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/master/src/getLCP.ts
 */
export function trackLargestContentfulPaintTiming(
  lifeCycle: LifeCycle,
  emitter: EventEmitter,
  callback: (lcpTiming: RelativeTime) => void
) {
  const firstHidden = trackFirstHidden()

  // Ignore entries that come after the first user interaction.  According to the documentation, the
  // browser should not send largest-contentful-paint entries after a user interact with the page,
  // but the web-vitals reference implementation uses this as a safeguard.
  let firstInteractionTimestamp = Infinity
  const { stop: stopEventListener } = addEventListeners(
    emitter,
    [DOM_EVENT.POINTER_DOWN, DOM_EVENT.KEY_DOWN],
    (event) => {
      firstInteractionTimestamp = event.timeStamp
    },
    { capture: true, once: true }
  )

  const { unsubscribe: unsubscribeLifeCycle } = lifeCycle.subscribe(
    LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED,
    (entries) => {
      const lcpEntry = findLast(
        entries,
        (entry): entry is RumLargestContentfulPaintTiming =>
          entry.entryType === 'largest-contentful-paint' &&
          entry.startTime < firstInteractionTimestamp &&
          entry.startTime < firstHidden.timeStamp &&
          entry.startTime < TIMING_MAXIMUM_DELAY
      )
      if (lcpEntry) {
        callback(lcpEntry.startTime)
      }
    }
  )

  return {
    stop: () => {
      stopEventListener()
      unsubscribeLifeCycle()
    },
  }
}

/**
 * Track the first input occurring during the initial View to return:
 * - First Input Delay
 * - First Input Time
 * Callback is called at most one time.
 * Documentation: https://web.dev/fid/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/master/src/getFID.ts
 */
export function trackFirstInputTimings(
  lifeCycle: LifeCycle,
  callback: ({ firstInputDelay, firstInputTime }: { firstInputDelay: Duration; firstInputTime: Duration }) => void
) {
  const firstHidden = trackFirstHidden()

  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    const firstInputEntry = find(
      entries,
      (entry): entry is RumFirstInputTiming =>
        entry.entryType === 'first-input' && entry.startTime < firstHidden.timeStamp
    )
    if (firstInputEntry) {
      const firstInputDelay = elapsed(firstInputEntry.startTime, firstInputEntry.processingStart)
      callback({
        // Ensure firstInputDelay to be positive, see
        // https://bugs.chromium.org/p/chromium/issues/detail?id=1185815
        firstInputDelay: firstInputDelay >= 0 ? firstInputDelay : (0 as Duration),
        firstInputTime: firstInputEntry.startTime as Duration,
      })
    }
  })

  return {
    stop,
  }
}

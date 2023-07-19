import type { Duration, RelativeTime } from '@datadog/browser-core'
import {
  setTimeout,
  assign,
  addEventListeners,
  DOM_EVENT,
  elapsed,
  ONE_MINUTE,
  find,
  findLast,
  relativeNow,
} from '@datadog/browser-core'

import type { RecorderApi } from '../../../boot/rumPublicApi'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import type {
  RumFirstInputTiming,
  RumLargestContentfulPaintTiming,
  RumPerformancePaintTiming,
} from '../../../browser/performanceCollection'
import { trackFirstHidden } from './trackFirstHidden'
import { addWebVitalTelemetryDebug } from './addWebVitalTelemetryDebug'

// Discard LCP and FCP timings above a certain delay to avoid incorrect data
// It happens in some cases like sleep mode or some browser implementations
export const TIMING_MAXIMUM_DELAY = 10 * ONE_MINUTE

/**
 * The initial view can finish quickly, before some metrics can be produced (ex: before the page load
 * event, or the first input). Also, we don't want to trigger a view update indefinitely, to avoid
 * updates on views that ended a long time ago. Keep watching for metrics after the view ends for a
 * limited amount of time.
 */
export const KEEP_TRACKING_TIMINGS_AFTER_VIEW_DELAY = 5 * ONE_MINUTE

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

export function trackInitialViewTimings(
  lifeCycle: LifeCycle,
  recorderApi: RecorderApi,
  setLoadEvent: (loadEnd: Duration) => void,
  scheduleViewUpdate: () => void
) {
  const timings: Timings = {}

  function setTimings(newTimings: Partial<Timings>) {
    assign(timings, newTimings)
    scheduleViewUpdate()
  }

  const { stop: stopNavigationTracking } = trackNavigationTimings(lifeCycle, (newTimings) => {
    setLoadEvent(newTimings.loadEvent)
    setTimings(newTimings)
  })
  const { stop: stopFCPTracking } = trackFirstContentfulPaintTiming(lifeCycle, (firstContentfulPaint) =>
    setTimings({ firstContentfulPaint })
  )
  const { stop: stopLCPTracking } = trackLargestContentfulPaintTiming(
    lifeCycle,
    window,
    (largestContentfulPaint, lcpElement) => {
      addWebVitalTelemetryDebug(recorderApi, 'LCP', lcpElement, largestContentfulPaint)

      setTimings({
        largestContentfulPaint,
      })
    }
  )

  const { stop: stopFIDTracking } = trackFirstInputTimings(
    lifeCycle,
    ({ firstInputDelay, firstInputTime, firstInputTarget }) => {
      addWebVitalTelemetryDebug(recorderApi, 'FID', firstInputTarget, firstInputTime)

      setTimings({
        firstInputDelay,
        firstInputTime,
      })
    }
  )

  function stop() {
    stopNavigationTracking()
    stopFCPTracking()
    stopLCPTracking()
    stopFIDTracking()
  }

  return {
    stop,
    timings,
    scheduleStop: () => {
      setTimeout(stop, KEEP_TRACKING_TIMINGS_AFTER_VIEW_DELAY)
    },
  }
}

interface NavigationTimings {
  domComplete: Duration
  domContentLoaded: Duration
  domInteractive: Duration
  loadEvent: Duration
  firstByte: Duration | undefined
}

export function trackNavigationTimings(lifeCycle: LifeCycle, callback: (timings: NavigationTimings) => void) {
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
  eventTarget: Window,
  callback: (lcpTiming: RelativeTime, lcpElement?: Element) => void
) {
  const firstHidden = trackFirstHidden()

  // Ignore entries that come after the first user interaction.  According to the documentation, the
  // browser should not send largest-contentful-paint entries after a user interact with the page,
  // but the web-vitals reference implementation uses this as a safeguard.
  let firstInteractionTimestamp = Infinity
  const { stop: stopEventListener } = addEventListeners(
    eventTarget,
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
        callback(lcpEntry.startTime, lcpEntry.element)
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
  callback: ({
    firstInputDelay,
    firstInputTime,
    firstInputTarget,
  }: {
    firstInputDelay: Duration
    firstInputTime: RelativeTime
    firstInputTarget: Node | undefined
  }) => void
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
        firstInputTime: firstInputEntry.startTime,
        firstInputTarget: firstInputEntry.target,
      })
    }
  })

  return {
    stop,
  }
}

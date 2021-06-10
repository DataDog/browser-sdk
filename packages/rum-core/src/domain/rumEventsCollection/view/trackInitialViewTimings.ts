import {
  addEventListeners,
  DOM_EVENT,
  Duration,
  elapsed,
  EventEmitter,
  RelativeTime,
  ONE_DAY,
  addMonitoringMessage,
  relativeNow,
  timeStampNow,
} from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { trackFirstHidden } from './trackFirstHidden'

export interface Timings {
  firstContentfulPaint?: Duration
  domInteractive?: Duration
  domContentLoaded?: Duration
  domComplete?: Duration
  loadEvent?: Duration
  largestContentfulPaint?: Duration
  firstInputDelay?: Duration
  firstInputTime?: Duration
}

export function trackInitialViewTimings(lifeCycle: LifeCycle, callback: (timings: Timings) => void) {
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

export function trackNavigationTimings(lifeCycle: LifeCycle, callback: (newTimings: Partial<Timings>) => void) {
  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (entry.entryType === 'navigation') {
      callback({
        domComplete: entry.domComplete,
        domContentLoaded: entry.domContentLoadedEventEnd,
        domInteractive: entry.domInteractive,
        loadEvent: entry.loadEventEnd,
      })
    }
  })

  return { stop }
}

export function trackFirstContentfulPaint(lifeCycle: LifeCycle, callback: (fcp: RelativeTime) => void) {
  const firstHidden = trackFirstHidden()
  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (
      entry.entryType === 'paint' &&
      entry.name === 'first-contentful-paint' &&
      entry.startTime < firstHidden.timeStamp
    ) {
      if (entry.startTime > ONE_DAY) {
        addMonitoringMessage('FCP > 1 day', {
          debug: {
            fcp: Math.round(entry.startTime),
            relativeNow: Math.round(relativeNow()),
            timeStampNow: timeStampNow(),
          },
        })
      }
      callback(entry.startTime)
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
export function trackLargestContentfulPaint(
  lifeCycle: LifeCycle,
  emitter: EventEmitter,
  callback: (value: RelativeTime) => void
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
    LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
    (entry) => {
      if (
        entry.entryType === 'largest-contentful-paint' &&
        entry.startTime < firstInteractionTimestamp &&
        entry.startTime < firstHidden.timeStamp
      ) {
        if (entry.startTime > ONE_DAY) {
          addMonitoringMessage('LCP > 1 day', {
            debug: {
              lcp: Math.round(entry.startTime),
              relativeNow: Math.round(relativeNow()),
              timeStampNow: timeStampNow(),
            },
          })
        }
        callback(entry.startTime)
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

  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (entry.entryType === 'first-input' && entry.startTime < firstHidden.timeStamp) {
      const firstInputDelay = elapsed(entry.startTime, entry.processingStart)
      callback({
        // Ensure firstInputDelay to be positive, see
        // https://bugs.chromium.org/p/chromium/issues/detail?id=1185815
        firstInputDelay: firstInputDelay >= 0 ? firstInputDelay : (0 as Duration),
        firstInputTime: entry.startTime as Duration,
      })
    }
  })

  return {
    stop,
  }
}

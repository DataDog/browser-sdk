import {
  addEventListeners,
  Configuration,
  DOM_EVENT,
  Duration,
  getRelativeTime,
  isNumber,
  monitor,
  Omit,
  relativeNow,
  RelativeTime,
  runOnReadyState,
  TimeStamp,
} from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { FAKE_INITIAL_DOCUMENT, isAllowedRequestUrl } from '../domain/rumEventsCollection/resource/resourceUtils'

import { getDocumentTraceId } from '../domain/tracing/getDocumentTraceId'
import { PerformanceEntryRepresentation } from '../domainContext.types'

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

export interface RumPerformanceLongTaskTiming {
  entryType: 'longtask'
  startTime: RelativeTime
  duration: Duration
  toJSON(): PerformanceEntryRepresentation
}

export interface RumPerformancePaintTiming {
  entryType: 'paint'
  name: 'first-paint' | 'first-contentful-paint'
  startTime: RelativeTime
}

export interface RumPerformanceNavigationTiming {
  entryType: 'navigation'
  domComplete: RelativeTime
  domContentLoadedEventEnd: RelativeTime
  domInteractive: RelativeTime
  loadEventEnd: RelativeTime
}

export interface RumLargestContentfulPaintTiming {
  entryType: 'largest-contentful-paint'
  startTime: RelativeTime
}

export interface RumFirstInputTiming {
  entryType: 'first-input'
  startTime: RelativeTime
  processingStart: RelativeTime
}

export interface RumLayoutShiftTiming {
  entryType: 'layout-shift'
  value: number
  hadRecentInput: boolean
}

export type RumPerformanceEntry =
  | RumPerformanceResourceTiming
  | RumPerformanceLongTaskTiming
  | RumPerformancePaintTiming
  | RumPerformanceNavigationTiming
  | RumLargestContentfulPaintTiming
  | RumFirstInputTiming
  | RumLayoutShiftTiming

function supportPerformanceObject() {
  return window.performance !== undefined && 'getEntries' in performance
}

export function supportPerformanceTimingEvent(entryType: string) {
  return (
    window.PerformanceObserver &&
    PerformanceObserver.supportedEntryTypes !== undefined &&
    PerformanceObserver.supportedEntryTypes.includes(entryType)
  )
}

export function supportPerformanceEntry() {
  // Safari 10 doesn't support PerformanceEntry
  return typeof PerformanceEntry === 'function'
}

export function startPerformanceCollection(lifeCycle: LifeCycle, configuration: Configuration) {
  retrieveInitialDocumentResourceTiming((timing) => {
    handleRumPerformanceEntry(lifeCycle, configuration, timing)
  })

  if (supportPerformanceObject()) {
    handlePerformanceEntries(lifeCycle, configuration, performance.getEntries())
  }
  if (window.PerformanceObserver) {
    const observer = new PerformanceObserver(
      monitor((entries: PerformanceObserverEntryList) =>
        handlePerformanceEntries(lifeCycle, configuration, entries.getEntries())
      )
    )
    const entryTypes = [
      'resource',
      'navigation',
      'longtask',
      'paint',
      'largest-contentful-paint',
      'first-input',
      'layout-shift',
    ]

    observer.observe({ entryTypes })

    if (supportPerformanceObject() && 'addEventListener' in performance) {
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1559377
      performance.addEventListener('resourcetimingbufferfull', () => {
        performance.clearResourceTimings()
      })
    }
  }
  if (!supportPerformanceTimingEvent('navigation')) {
    retrieveNavigationTiming((timing) => {
      handleRumPerformanceEntry(lifeCycle, configuration, timing)
    })
  }
  if (!supportPerformanceTimingEvent('first-input')) {
    retrieveFirstInputTiming((timing) => {
      handleRumPerformanceEntry(lifeCycle, configuration, timing)
    })
  }
}

export function retrieveInitialDocumentResourceTiming(callback: (timing: RumPerformanceResourceTiming) => void) {
  runOnReadyState('interactive', () => {
    let timing: RumPerformanceResourceTiming

    const forcedAttributes = {
      entryType: 'resource' as const,
      initiatorType: FAKE_INITIAL_DOCUMENT,
      traceId: getDocumentTraceId(document),
    }
    if (supportPerformanceTimingEvent('navigation') && performance.getEntriesByType('navigation').length > 0) {
      const navigationEntry = performance.getEntriesByType('navigation')[0]
      timing = { ...navigationEntry.toJSON(), ...forcedAttributes }
    } else {
      const relativePerformanceTiming = computeRelativePerformanceTiming()
      timing = {
        ...relativePerformanceTiming,
        decodedBodySize: 0,
        duration: relativePerformanceTiming.responseEnd,
        name: window.location.href,
        startTime: 0 as RelativeTime,
        ...forcedAttributes,
      }
    }
    callback(timing)
  })
}

function retrieveNavigationTiming(callback: (timing: RumPerformanceNavigationTiming) => void) {
  function sendFakeTiming() {
    callback({
      ...computeRelativePerformanceTiming(),
      entryType: 'navigation',
    })
  }

  runOnReadyState('complete', () => {
    // Send it a bit after the actual load event, so the "loadEventEnd" timing is accurate
    setTimeout(monitor(sendFakeTiming))
  })
}

/**
 * first-input timing entry polyfill based on
 * https://github.com/GoogleChrome/web-vitals/blob/master/src/lib/polyfills/firstInputPolyfill.ts
 */
function retrieveFirstInputTiming(callback: (timing: RumFirstInputTiming) => void) {
  const startTimeStamp = Date.now()
  let timingSent = false

  const { stop: removeEventListeners } = addEventListeners(
    window,
    [DOM_EVENT.CLICK, DOM_EVENT.MOUSE_DOWN, DOM_EVENT.KEY_DOWN, DOM_EVENT.TOUCH_START, DOM_EVENT.POINTER_DOWN],
    (evt) => {
      // Only count cancelable events, which should trigger behavior important to the user.
      if (!evt.cancelable) {
        return
      }

      // This timing will be used to compute the "first Input delay", which is the delta between
      // when the system received the event (e.g. evt.timeStamp) and when it could run the callback
      // (e.g. performance.now()).
      const timing: RumFirstInputTiming = {
        entryType: 'first-input',
        processingStart: relativeNow(),
        startTime: evt.timeStamp as RelativeTime,
      }

      if (evt.type === DOM_EVENT.POINTER_DOWN) {
        sendTimingIfPointerIsNotCancelled(timing)
      } else {
        sendTiming(timing)
      }
    },
    { passive: true, capture: true }
  )

  /**
   * Pointer events are a special case, because they can trigger main or compositor thread behavior.
   * We differentiate these cases based on whether or not we see a pointercancel event, which are
   * fired when we scroll. If we're scrolling we don't need to report input delay since FID excludes
   * scrolling and pinch/zooming.
   */
  function sendTimingIfPointerIsNotCancelled(timing: RumFirstInputTiming) {
    addEventListeners(
      window,
      [DOM_EVENT.POINTER_UP, DOM_EVENT.POINTER_CANCEL],
      (event) => {
        if (event.type === DOM_EVENT.POINTER_UP) {
          sendTiming(timing)
        }
      },
      { once: true }
    )
  }

  function sendTiming(timing: RumFirstInputTiming) {
    if (!timingSent) {
      timingSent = true
      removeEventListeners()
      // In some cases the recorded delay is clearly wrong, e.g. it's negative or it's larger than
      // the time between now and when the page was loaded.
      // - https://github.com/GoogleChromeLabs/first-input-delay/issues/4
      // - https://github.com/GoogleChromeLabs/first-input-delay/issues/6
      // - https://github.com/GoogleChromeLabs/first-input-delay/issues/7
      const delay = timing.processingStart - timing.startTime
      if (delay >= 0 && delay < Date.now() - startTimeStamp) {
        callback(timing)
      }
    }
  }
}

export type RelativePerformanceTiming = {
  -readonly [key in keyof Omit<PerformanceTiming, 'toJSON'>]: RelativeTime
}

function computeRelativePerformanceTiming() {
  const result: Partial<RelativePerformanceTiming> = {}
  const timing = performance.timing
  for (const key in timing) {
    if (isNumber(timing[key as keyof PerformanceTiming])) {
      const numberKey = key as keyof RelativePerformanceTiming
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const timingElement = timing[numberKey] as TimeStamp
      result[numberKey] = timingElement === 0 ? (0 as RelativeTime) : getRelativeTime(timingElement)
    }
  }
  return result as RelativePerformanceTiming
}

function handlePerformanceEntries(lifeCycle: LifeCycle, configuration: Configuration, entries: PerformanceEntry[]) {
  entries.forEach((entry) => {
    if (
      entry.entryType === 'resource' ||
      entry.entryType === 'navigation' ||
      entry.entryType === 'paint' ||
      entry.entryType === 'longtask' ||
      entry.entryType === 'largest-contentful-paint' ||
      entry.entryType === 'first-input' ||
      entry.entryType === 'layout-shift'
    ) {
      handleRumPerformanceEntry(lifeCycle, configuration, (entry as unknown) as RumPerformanceEntry)
    }
  })
}

function handleRumPerformanceEntry(lifeCycle: LifeCycle, configuration: Configuration, entry: RumPerformanceEntry) {
  if (isIncompleteNavigation(entry) || isForbiddenResource(configuration, entry)) {
    return
  }

  lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, entry)
}

function isIncompleteNavigation(entry: RumPerformanceEntry) {
  return entry.entryType === 'navigation' && entry.loadEventEnd <= 0
}

function isForbiddenResource(configuration: Configuration, entry: RumPerformanceEntry) {
  return entry.entryType === 'resource' && !isAllowedRequestUrl(configuration, entry.name)
}

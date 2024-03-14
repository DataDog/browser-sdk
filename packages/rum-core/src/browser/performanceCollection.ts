import type { Duration, RelativeTime, TimeStamp } from '@datadog/browser-core'
import {
  dateNow,
  assign,
  addEventListeners,
  DOM_EVENT,
  getRelativeTime,
  isNumber,
  monitor,
  setTimeout,
  relativeNow,
  runOnReadyState,
  addEventListener,
  objectHasValue,
} from '@datadog/browser-core'

import type { RumConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import { FAKE_INITIAL_DOCUMENT, isAllowedRequestUrl } from '../domain/resource/resourceUtils'

import { getDocumentTraceId } from '../domain/tracing/getDocumentTraceId'

type RumPerformanceObserverConstructor = new (callback: PerformanceObserverCallback) => RumPerformanceObserver

export interface BrowserWindow extends Window {
  PerformanceObserver: RumPerformanceObserverConstructor
  performance: Performance & { interactionCount?: number }
}

export interface RumPerformanceObserver extends PerformanceObserver {
  observe(options?: PerformanceObserverInit & { durationThreshold: number }): void
}

// We want to use a real enum (i.e. not a const enum) here, to be able to check whether an arbitrary
// string is an expected performance entry
// eslint-disable-next-line no-restricted-syntax
export enum RumPerformanceEntryType {
  EVENT = 'event',
  FIRST_INPUT = 'first-input',
  LARGEST_CONTENTFUL_PAINT = 'largest-contentful-paint',
  LAYOUT_SHIFT = 'layout-shift',
  LONG_TASK = 'longtask',
  NAVIGATION = 'navigation',
  PAINT = 'paint',
  RESOURCE = 'resource',
}

export interface RumPerformanceResourceTiming {
  entryType: RumPerformanceEntryType.RESOURCE
  initiatorType: string
  responseStatus?: number
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
  encodedBodySize: number
  transferSize: number
  renderBlockingStatus?: string
  traceId?: string
  toJSON(): Omit<PerformanceEntry, 'toJSON'>
}

export interface RumPerformanceLongTaskTiming {
  name: string
  entryType: RumPerformanceEntryType.LONG_TASK
  startTime: RelativeTime
  duration: Duration
  toJSON(): Omit<PerformanceEntry, 'toJSON'>
}

export interface RumPerformancePaintTiming {
  entryType: RumPerformanceEntryType.PAINT
  name: 'first-paint' | 'first-contentful-paint'
  startTime: RelativeTime
}

export interface RumPerformanceNavigationTiming {
  entryType: RumPerformanceEntryType.NAVIGATION
  domComplete: RelativeTime
  domContentLoadedEventEnd: RelativeTime
  domInteractive: RelativeTime
  loadEventEnd: RelativeTime
  responseStart: RelativeTime
}

export interface RumLargestContentfulPaintTiming {
  entryType: RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT
  startTime: RelativeTime
  size: number
  element?: Element
  toJSON(): Omit<RumLargestContentfulPaintTiming, 'toJSON'>
}

export interface RumFirstInputTiming {
  entryType: RumPerformanceEntryType.FIRST_INPUT
  startTime: RelativeTime
  processingStart: RelativeTime
  processingEnd: RelativeTime
  duration: Duration
  target?: Node
  interactionId?: number
  name: string
}

export interface RumPerformanceEventTiming {
  entryType: RumPerformanceEntryType.EVENT
  startTime: RelativeTime
  processingStart: RelativeTime
  processingEnd: RelativeTime
  duration: Duration
  interactionId?: number
  target?: Node
  name: string
}

export interface RumLayoutShiftTiming {
  entryType: RumPerformanceEntryType.LAYOUT_SHIFT
  startTime: RelativeTime
  value: number
  hadRecentInput: boolean
  sources?: Array<{
    node?: Node
  }>
}

export type RumPerformanceEntry =
  | RumPerformanceResourceTiming
  | RumPerformanceLongTaskTiming
  | RumPerformancePaintTiming
  | RumPerformanceNavigationTiming
  | RumLargestContentfulPaintTiming
  | RumFirstInputTiming
  | RumPerformanceEventTiming
  | RumLayoutShiftTiming

function supportPerformanceObject() {
  return window.performance !== undefined && 'getEntries' in performance
}

export function supportPerformanceTimingEvent(entryType: RumPerformanceEntryType) {
  return (
    window.PerformanceObserver &&
    PerformanceObserver.supportedEntryTypes !== undefined &&
    PerformanceObserver.supportedEntryTypes.includes(entryType)
  )
}

export function startPerformanceCollection(lifeCycle: LifeCycle, configuration: RumConfiguration) {
  const cleanupTasks: Array<() => void> = []
  retrieveInitialDocumentResourceTiming(configuration, (timing) => {
    handleRumPerformanceEntries(lifeCycle, configuration, [timing])
  })

  if (supportPerformanceObject()) {
    const performanceEntries = performance.getEntries()
    // Because the performance entry list can be quite large
    // delay the computation to prevent the SDK from blocking the main thread on init
    setTimeout(() => handleRumPerformanceEntries(lifeCycle, configuration, performanceEntries))
  }

  if (window.PerformanceObserver) {
    const handlePerformanceEntryList = monitor((entries: PerformanceObserverEntryList) =>
      handleRumPerformanceEntries(lifeCycle, configuration, entries.getEntries())
    )
    const mainEntries = [
      RumPerformanceEntryType.RESOURCE,
      RumPerformanceEntryType.NAVIGATION,
      RumPerformanceEntryType.LONG_TASK,
      RumPerformanceEntryType.PAINT,
    ]
    const experimentalEntries = [
      RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT,
      RumPerformanceEntryType.FIRST_INPUT,
      RumPerformanceEntryType.LAYOUT_SHIFT,
      RumPerformanceEntryType.EVENT,
    ]

    try {
      // Experimental entries are not retrieved by performance.getEntries()
      // use a single PerformanceObserver with buffered flag by type
      // to get values that could happen before SDK init
      experimentalEntries.forEach((type) => {
        const observer = new (window as BrowserWindow).PerformanceObserver(handlePerformanceEntryList)
        observer.observe({
          type,
          buffered: true,
          // durationThreshold only impact PerformanceEventTiming entries used for INP computation which requires a threshold at 40 (default is 104ms)
          // cf: https://github.com/GoogleChrome/web-vitals/blob/3806160ffbc93c3c4abf210a167b81228172b31c/src/onINP.ts#L209
          durationThreshold: 40,
        })
        cleanupTasks.push(() => observer.disconnect())
      })
    } catch (e) {
      // Some old browser versions (ex: chrome 67) don't support the PerformanceObserver type and buffered options
      // In these cases, fallback to PerformanceObserver with entryTypes
      mainEntries.push(...experimentalEntries)
    }

    const mainObserver = new PerformanceObserver(handlePerformanceEntryList)
    mainObserver.observe({ entryTypes: mainEntries })
    cleanupTasks.push(() => mainObserver.disconnect())

    if (supportPerformanceObject() && 'addEventListener' in performance) {
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1559377
      const { stop: removePerformanceListener } = addEventListener(
        configuration,
        performance,
        'resourcetimingbufferfull',
        () => {
          performance.clearResourceTimings()
        }
      )
      cleanupTasks.push(removePerformanceListener)
    }
  }
  if (!supportPerformanceTimingEvent(RumPerformanceEntryType.NAVIGATION)) {
    retrieveNavigationTiming(configuration, (timing) => {
      handleRumPerformanceEntries(lifeCycle, configuration, [timing])
    })
  }
  if (!supportPerformanceTimingEvent(RumPerformanceEntryType.FIRST_INPUT)) {
    const { stop: stopFirstInputTiming } = retrieveFirstInputTiming(configuration, (timing) => {
      handleRumPerformanceEntries(lifeCycle, configuration, [timing])
    })
    cleanupTasks.push(stopFirstInputTiming)
  }
  return {
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
  }
}

export function retrieveInitialDocumentResourceTiming(
  configuration: RumConfiguration,
  callback: (timing: RumPerformanceResourceTiming) => void
) {
  runOnReadyState(configuration, 'interactive', () => {
    let timing: RumPerformanceResourceTiming

    const forcedAttributes = {
      entryType: RumPerformanceEntryType.RESOURCE as const,
      initiatorType: FAKE_INITIAL_DOCUMENT,
      traceId: getDocumentTraceId(document),
      toJSON: () => assign({}, timing, { toJSON: undefined }),
    }
    if (
      supportPerformanceTimingEvent(RumPerformanceEntryType.NAVIGATION) &&
      performance.getEntriesByType(RumPerformanceEntryType.NAVIGATION).length > 0
    ) {
      const navigationEntry = performance.getEntriesByType(RumPerformanceEntryType.NAVIGATION)[0]
      timing = assign(navigationEntry.toJSON() as RumPerformanceResourceTiming, forcedAttributes)
    } else {
      const relativePerformanceTiming = computeRelativePerformanceTiming()
      timing = assign(
        relativePerformanceTiming,
        {
          decodedBodySize: 0,
          encodedBodySize: 0,
          transferSize: 0,
          renderBlockingStatus: 'non-blocking',
          duration: relativePerformanceTiming.responseEnd,
          name: window.location.href,
          startTime: 0 as RelativeTime,
        },
        forcedAttributes
      )
    }
    callback(timing)
  })
}

function retrieveNavigationTiming(
  configuration: RumConfiguration,
  callback: (timing: RumPerformanceNavigationTiming) => void
) {
  function sendFakeTiming() {
    callback(
      assign(computeRelativePerformanceTiming(), {
        entryType: RumPerformanceEntryType.NAVIGATION as const,
      })
    )
  }

  runOnReadyState(configuration, 'complete', () => {
    // Send it a bit after the actual load event, so the "loadEventEnd" timing is accurate
    setTimeout(sendFakeTiming)
  })
}

/**
 * first-input timing entry polyfill based on
 * https://github.com/GoogleChrome/web-vitals/blob/master/src/lib/polyfills/firstInputPolyfill.ts
 */
function retrieveFirstInputTiming(configuration: RumConfiguration, callback: (timing: RumFirstInputTiming) => void) {
  const startTimeStamp = dateNow()
  let timingSent = false

  const { stop: removeEventListeners } = addEventListeners(
    configuration,
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
        entryType: RumPerformanceEntryType.FIRST_INPUT,
        processingStart: relativeNow(),
        processingEnd: relativeNow(),
        startTime: evt.timeStamp as RelativeTime,
        duration: 0 as Duration, // arbitrary value to avoid nullable duration and simplify INP logic
        name: '',
      }

      if (evt.type === DOM_EVENT.POINTER_DOWN) {
        sendTimingIfPointerIsNotCancelled(configuration, timing)
      } else {
        sendTiming(timing)
      }
    },
    { passive: true, capture: true }
  )

  return { stop: removeEventListeners }

  /**
   * Pointer events are a special case, because they can trigger main or compositor thread behavior.
   * We differentiate these cases based on whether or not we see a pointercancel event, which are
   * fired when we scroll. If we're scrolling we don't need to report input delay since FID excludes
   * scrolling and pinch/zooming.
   */
  function sendTimingIfPointerIsNotCancelled(configuration: RumConfiguration, timing: RumFirstInputTiming) {
    addEventListeners(
      configuration,
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
      if (delay >= 0 && delay < dateNow() - startTimeStamp) {
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
      const timingElement = timing[numberKey] as TimeStamp
      result[numberKey] = timingElement === 0 ? (0 as RelativeTime) : getRelativeTime(timingElement)
    }
  }
  return result as RelativePerformanceTiming
}

function handleRumPerformanceEntries(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  entries: Array<PerformanceEntry | RumPerformanceEntry>
) {
  const rumPerformanceEntries = entries.filter((entry): entry is RumPerformanceEntry =>
    objectHasValue(RumPerformanceEntryType, entry.entryType)
  )

  const rumAllowedPerformanceEntries = rumPerformanceEntries.filter(
    (entry) => !isIncompleteNavigation(entry) && !isForbiddenResource(configuration, entry)
  )

  if (rumAllowedPerformanceEntries.length) {
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, rumAllowedPerformanceEntries)
  }
}

function isIncompleteNavigation(entry: RumPerformanceEntry) {
  return entry.entryType === RumPerformanceEntryType.NAVIGATION && entry.loadEventEnd <= 0
}

function isForbiddenResource(configuration: RumConfiguration, entry: RumPerformanceEntry) {
  return entry.entryType === RumPerformanceEntryType.RESOURCE && !isAllowedRequestUrl(configuration, entry.name)
}

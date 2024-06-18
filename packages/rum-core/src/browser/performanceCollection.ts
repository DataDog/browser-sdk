import type { Duration, RelativeTime } from '@datadog/browser-core'
import {
  dateNow,
  assign,
  addEventListeners,
  DOM_EVENT,
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
import { FAKE_INITIAL_DOCUMENT, computeRelativePerformanceTiming } from '../domain/resource/resourceUtils'
import { getDocumentTraceId } from '../domain/tracing/getDocumentTraceId'
import type {
  BrowserWindow,
  RumFirstInputTiming,
  RumPerformanceEntry,
  RumPerformanceNavigationTiming,
  RumPerformanceResourceTiming,
} from './performanceObservable'
import { RumPerformanceEntryType, supportPerformanceTimingEvent } from './performanceObservable'

function supportPerformanceObject() {
  return window.performance !== undefined && 'getEntries' in performance
}

export function startPerformanceCollection(lifeCycle: LifeCycle, configuration: RumConfiguration) {
  const cleanupTasks: Array<() => void> = []

  if (supportPerformanceObject()) {
    const performanceEntries = performance.getEntries()
    // Because the performance entry list can be quite large
    // delay the computation to prevent the SDK from blocking the main thread on init
    setTimeout(() => handleRumPerformanceEntries(lifeCycle, performanceEntries))
  }

  if (window.PerformanceObserver) {
    const handlePerformanceEntryList = monitor((entries: PerformanceObserverEntryList) =>
      handleRumPerformanceEntries(lifeCycle, entries.getEntries())
    )
    const mainEntries = [
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
      handleRumPerformanceEntries(lifeCycle, [timing])
    })
  }
  if (!supportPerformanceTimingEvent(RumPerformanceEntryType.FIRST_INPUT)) {
    const { stop: stopFirstInputTiming } = retrieveFirstInputTiming(configuration, (timing) => {
      handleRumPerformanceEntries(lifeCycle, [timing])
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

function handleRumPerformanceEntries(lifeCycle: LifeCycle, entries: Array<PerformanceEntry | RumPerformanceEntry>) {
  const rumPerformanceEntries = entries.filter((entry): entry is RumPerformanceEntry =>
    objectHasValue(RumPerformanceEntryType, entry.entryType)
  )

  const rumAllowedPerformanceEntries = rumPerformanceEntries.filter((entry) => !isIncompleteNavigation(entry))

  if (rumAllowedPerformanceEntries.length) {
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, rumAllowedPerformanceEntries)
  }
}

function isIncompleteNavigation(entry: RumPerformanceEntry) {
  return entry.entryType === RumPerformanceEntryType.NAVIGATION && entry.loadEventEnd <= 0
}

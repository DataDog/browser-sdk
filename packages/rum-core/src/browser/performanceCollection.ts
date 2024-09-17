import type { Duration, RelativeTime } from '@datadog/browser-core'
import {
  dateNow,
  addEventListeners,
  DOM_EVENT,
  monitor,
  setTimeout,
  relativeNow,
  addEventListener,
  objectHasValue,
} from '@datadog/browser-core'

import type { RumConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type {
  BrowserWindow,
  RumFirstInputTiming,
  RumPerformanceEntry,
  RumPerformanceResourceTiming,
} from './performanceObservable'
import { RumPerformanceEntryType, supportPerformanceTimingEvent } from './performanceObservable'

function supportPerformanceObject() {
  return window.performance !== undefined && 'getEntries' in performance
}

export type CollectionRumPerformanceEntry = Exclude<RumPerformanceEntry, RumPerformanceResourceTiming>

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
    const experimentalEntries = [
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
      const mainObserver = new PerformanceObserver(handlePerformanceEntryList)
      try {
        mainObserver.observe({ entryTypes: experimentalEntries })
        cleanupTasks.push(() => mainObserver.disconnect())
      } catch {
        // Old versions of Safari are throwing "entryTypes contained only unsupported types"
        // errors when observing only unsupported entry types.
        //
        // We could use `supportPerformanceTimingEvent` to make sure we don't invoke
        // `observer.observe` with an unsupported entry type, but Safari 11 and 12 don't support
        // `Performance.supportedEntryTypes`, so doing so would lose support for these versions
        // even if they do support the entry type.
      }
    }

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

function handleRumPerformanceEntries(
  lifeCycle: LifeCycle,
  entries: Array<PerformanceEntry | CollectionRumPerformanceEntry>
) {
  const rumPerformanceEntries = entries.filter((entry): entry is CollectionRumPerformanceEntry =>
    objectHasValue(RumPerformanceEntryType, entry.entryType)
  )

  if (rumPerformanceEntries.length) {
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, rumPerformanceEntries)
  }
}

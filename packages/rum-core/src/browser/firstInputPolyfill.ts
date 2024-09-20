import type { Duration, RelativeTime } from '@datadog/browser-core'
import { addEventListeners, dateNow, DOM_EVENT, relativeNow } from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'

/**
 * first-input timing entry polyfill based on
 * https://github.com/GoogleChrome/web-vitals/blob/master/src/lib/polyfills/firstInputPolyfill.ts
 */
export function retrieveFirstInputTiming(
  configuration: RumConfiguration,
  callback: (timing: PerformanceEventTiming) => void
) {
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
      const timing: PerformanceEventTiming = {
        entryType: 'first-input',
        processingStart: relativeNow(),
        processingEnd: relativeNow(),
        startTime: evt.timeStamp as RelativeTime,
        duration: 0 as Duration, // arbitrary value to avoid nullable duration and simplify INP logic
        name: '',
        cancelable: false,
        target: null,
        toJSON: () => ({}),
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
  function sendTimingIfPointerIsNotCancelled(configuration: RumConfiguration, timing: PerformanceEventTiming) {
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

  function sendTiming(timing: PerformanceEventTiming) {
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

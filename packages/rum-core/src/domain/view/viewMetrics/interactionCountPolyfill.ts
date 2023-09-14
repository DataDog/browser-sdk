/**
 * performance.interactionCount polyfill
 *
 * The interactionCount is an integer which counts the total number of distinct user interactions,
 * for which there was a unique interactionId.
 *
 * The interactionCount polyfill is an estimate based on a convention specific to Chrome. Cf: https://github.com/GoogleChrome/web-vitals/pull/213
 * This is currently not an issue as the polyfill is only used for INP which is currently only supported on Chrome.
 * Hopefully when/if other browsers will support INP, they will also implement performance.interactionCount at the same time, so we won't need that polyfill.
 *
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/main/src/lib/polyfills/interactionCountPolyfill.ts
 */

import { monitor } from '@datadog/browser-core'
import type {
  BrowserWindow,
  RumPerformanceEventTiming,
  RumPerformanceObserver,
} from '../../../browser/performanceCollection'

let observer: RumPerformanceObserver | undefined

let interactionCountEstimate = 0
let minKnownInteractionId = Infinity
let maxKnownInteractionId = 0

export function initInteractionCountPolyfill() {
  if ('interactionCount' in performance || observer) {
    return
  }

  observer = new (window as BrowserWindow).PerformanceObserver(
    monitor((entries: PerformanceObserverEntryList) => {
      entries.getEntries().forEach((e) => {
        const entry = e as unknown as RumPerformanceEventTiming

        if (entry.interactionId) {
          minKnownInteractionId = Math.min(minKnownInteractionId, entry.interactionId)
          maxKnownInteractionId = Math.max(maxKnownInteractionId, entry.interactionId)

          interactionCountEstimate = (maxKnownInteractionId - minKnownInteractionId) / 7 + 1
        }
      })
    })
  )

  observer.observe({ type: 'event', buffered: true, durationThreshold: 0 })
}

/**
 * Returns the `interactionCount` value using the native API (if available)
 * or the polyfill estimate in this module.
 */
export const getInteractionCount = () =>
  observer ? interactionCountEstimate : (window as BrowserWindow).performance.interactionCount! || 0

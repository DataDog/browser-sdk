/**
 * interactionCount polyfill
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/main/src/lib/polyfills/interactionCountPolyfill.ts
 */

import type { BrowserWindow, RumEventTiming, RumPerformanceObserver } from '../../../browser/performanceCollection'

let observer: RumPerformanceObserver | undefined

let interactionCountEstimate = 0
let minKnownInteractionId = Infinity
let maxKnownInteractionId = 0

export function initInteractionCountPolyfill() {
  if ('interactionCount' in performance || observer) {
    return
  }

  observer = new (window as BrowserWindow).PerformanceObserver((entries: PerformanceObserverEntryList) => {
    entries.getEntries().forEach((e) => {
      const entry = e as unknown as RumEventTiming

      if (entry.interactionId) {
        minKnownInteractionId = Math.min(minKnownInteractionId, entry.interactionId)
        maxKnownInteractionId = Math.max(maxKnownInteractionId, entry.interactionId)

        interactionCountEstimate = maxKnownInteractionId ? (maxKnownInteractionId - minKnownInteractionId) / 7 + 1 : 0
      }
    })
  })

  observer.observe({ type: 'event', buffered: true, durationThreshold: 0 })
}

/**
 * Returns the `interactionCount` value using the native API (if available)
 * or the polyfill estimate in this module.
 */
export const getInteractionCount = () =>
  observer ? interactionCountEstimate : (window as BrowserWindow).performance.interactionCount! || 0

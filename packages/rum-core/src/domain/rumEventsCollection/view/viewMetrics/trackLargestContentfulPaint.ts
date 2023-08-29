import type { RelativeTime } from '@datadog/browser-core'
import { DOM_EVENT, ONE_MINUTE, addEventListeners, findLast } from '@datadog/browser-core'
import { LifeCycleEventType, type LifeCycle } from '../../../lifeCycle'
import type { RumConfiguration } from '../../../configuration'
import type { RumLargestContentfulPaintTiming } from '../../../../browser/performanceCollection'
import { trackFirstHidden } from './trackFirstHidden'

// Discard LCP timings above a certain delay to avoid incorrect data
// It happens in some cases like sleep mode or some browser implementations
export const LCP_MAXIMUM_DELAY = 10 * ONE_MINUTE

/**
 * Track the largest contentful paint (LCP) occurring during the initial View.  This can yield
 * multiple values, only the most recent one should be used.
 * Documentation: https://web.dev/lcp/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/master/src/getLCP.ts
 */
export function trackLargestContentfulPaint(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  eventTarget: Window,
  callback: (lcpTiming: RelativeTime, lcpElement?: Element) => void
) {
  const firstHidden = trackFirstHidden(configuration)

  // Ignore entries that come after the first user interaction.  According to the documentation, the
  // browser should not send largest-contentful-paint entries after a user interact with the page,
  // but the web-vitals reference implementation uses this as a safeguard.
  let firstInteractionTimestamp = Infinity
  const { stop: stopEventListener } = addEventListeners(
    configuration,
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
          entry.startTime < LCP_MAXIMUM_DELAY
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

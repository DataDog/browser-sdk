import type { RelativeTime } from '@datadog/browser-core'
import {
  DOM_EVENT,
  ONE_MINUTE,
  addEventListeners,
  findLast,
  ExperimentalFeature,
  isExperimentalFeatureEnabled,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../../configuration'
import { createPerformanceObservable, RumPerformanceEntryType } from '../../../browser/performanceObservable'
import { findLcpResourceEntry, getNavigationEntry, sanitizeFirstByte } from '../../../browser/performanceUtils'
import type { RumLargestContentfulPaintTiming } from '../../../browser/performanceObservable'
import { getSelectorFromElement } from '../../getSelectorFromElement'
import type { FirstHidden } from './trackFirstHidden'

// Discard LCP timings above a certain delay to avoid incorrect data
// It happens in some cases like sleep mode or some browser implementations
export const LCP_MAXIMUM_DELAY = 10 * ONE_MINUTE

export interface LargestContentfulPaint {
  value: RelativeTime
  targetSelector?: string
  resourceUrl?: string
  subParts?: {
    loadDelay: RelativeTime
    loadTime: RelativeTime
    renderDelay: RelativeTime
  }
}

/**
 * Track the largest contentful paint (LCP) occurring during the initial View.  This can yield
 * multiple values, only the most recent one should be used.
 * Documentation: https://web.dev/lcp/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/master/src/onLCP.ts
 */
export function trackLargestContentfulPaint(
  configuration: RumConfiguration,
  firstHidden: FirstHidden,
  eventTarget: Window,
  callback: (largestContentfulPaint: LargestContentfulPaint) => void
) {
  // Ignore entries that come after the first user interaction. According to the documentation, the
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

  let biggestLcpSize = 0
  const performanceLcpSubscription = createPerformanceObservable(configuration, {
    type: RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT,
    buffered: true,
  }).subscribe((entries) => {
    const lcpEntry = findLast(
      entries,
      (entry): entry is RumLargestContentfulPaintTiming =>
        entry.entryType === RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT &&
        entry.startTime < firstInteractionTimestamp &&
        entry.startTime < firstHidden.timeStamp &&
        entry.startTime < LCP_MAXIMUM_DELAY &&
        // Ensure to get the LCP entry with the biggest size, see
        // https://bugs.chromium.org/p/chromium/issues/detail?id=1516655
        entry.size > biggestLcpSize
    )
    if (lcpEntry) {
      let lcpTargetSelector
      if (lcpEntry.element) {
        lcpTargetSelector = getSelectorFromElement(lcpEntry.element, configuration.actionNameAttribute)
      }

      const resourceUrl = computeLcpEntryUrl(lcpEntry)
      const lcpValue = Math.max(0, lcpEntry.startTime) as RelativeTime

      const subParts = isExperimentalFeatureEnabled(ExperimentalFeature.COLLECT_LCP_SUBPARTS)
        ? computeLcpSubParts(resourceUrl, lcpValue)
        : undefined

      callback({
        value: lcpValue,
        targetSelector: lcpTargetSelector,
        resourceUrl,
        subParts,
      })
      biggestLcpSize = lcpEntry.size
    }
  })

  return {
    stop: () => {
      stopEventListener()
      performanceLcpSubscription.unsubscribe()
    },
  }
}

// The property url report an empty string if the value is not available, we shouldn't report it in this case.
function computeLcpEntryUrl(entry: RumLargestContentfulPaintTiming) {
  return entry.url === '' ? undefined : entry.url
}

/**
 * Compute the LCP sub-parts breakdown (loadDelay, loadTime, renderDelay).
 * Returns undefined if navigation timing data or TTFB is unavailable.
 */
function computeLcpSubParts(
  resourceUrl: string | undefined,
  lcpValue: RelativeTime
): LargestContentfulPaint['subParts'] {
  const navigationEntry = getNavigationEntry()
  const firstByte = sanitizeFirstByte(navigationEntry)

  if (firstByte === undefined) {
    return undefined
  }

  const lcpResourceEntry = resourceUrl ? findLcpResourceEntry(resourceUrl, lcpValue) : undefined
  const lcpRequestStart = getLcpResourceRequestStart(lcpResourceEntry, firstByte)

  // Cap at LCP time to handle resources that continue downloading after LCP (e.g., videos)
  const lcpResponseEnd = Math.min(lcpValue, Math.max(lcpRequestStart, lcpResourceEntry?.responseEnd || 0))

  return {
    loadDelay: (lcpRequestStart - firstByte) as RelativeTime,
    loadTime: (lcpResponseEnd - lcpRequestStart) as RelativeTime,
    renderDelay: (lcpValue - lcpResponseEnd) as RelativeTime,
  }
}

/**
 * Get the request start time for the LCP resource.
 * Prefers requestStart (more accurate for Timing-Allow-Origin resources) over startTime.
 * Returns firstByte when there's no resource (e.g., text elements) to ensure loadDelay is 0.
 */
function getLcpResourceRequestStart(
  lcpResourceEntry: PerformanceResourceTiming | undefined,
  firstByte: RelativeTime
): RelativeTime {
  if (!lcpResourceEntry) {
    return firstByte
  }
  const requestStart = Math.max(firstByte, lcpResourceEntry.requestStart || lcpResourceEntry.startTime)
  return requestStart as RelativeTime
}

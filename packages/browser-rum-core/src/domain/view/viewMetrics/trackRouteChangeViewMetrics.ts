import type { RelativeTime } from '@datadog/js-core/time'
import type { RumConfiguration } from '../../configuration'
import { createPerformanceObservable, RumPerformanceEntryType } from '../../../browser/performanceObservable'
import type {
  RumInteractionContentfulPaintTiming,
  RumSoftNavigationEntry,
} from '../../../browser/performanceObservable'
import { getSelectorFromElement } from '../../getSelectorFromElement'
import type { LargestContentfulPaint } from './trackLargestContentfulPaint'
import { computeLcpSubParts } from './trackLargestContentfulPaint'
import type { InitialViewMetrics } from './trackInitialViewMetrics'

/**
 * Tracks LCP for a `route_change` view via Chrome's Soft Navigation API (gated behind
 * ExperimentalFeature.SOFT_NAVIGATION + browser support, see trackViews.ts).
 *
 * The soft-navigation entry arrives asynchronously, so `setViewEnd` must unsubscribe from it
 * immediately when the view ends -- otherwise an ended view could steal the next view's entry.
 * ICP entries keep being tracked until `stop()`, since by then the `interactionId` to filter on
 * is already known.
 */
export function trackRouteChangeViewMetrics(configuration: RumConfiguration, scheduleViewUpdate: () => void) {
  const initialViewMetrics: InitialViewMetrics = {}

  let softNavEntry: RumSoftNavigationEntry | undefined
  let softNavStopped = false
  let biggestIcpSize = 0
  const pendingIcpEntries: RumInteractionContentfulPaintTiming[] = []

  const icpSubscription = createPerformanceObservable({
    type: RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT,
    buffered: true,
  }).subscribe((entries) => {
    if (!softNavEntry) {
      // Buffer only until we know which interaction to correlate against -- once softNavEntry is
      // set, applyIcpEntries below handles everything live and this buffer is never read again.
      pendingIcpEntries.push(...entries)
    }
    applyIcpEntries(entries)
  })

  const softNavSubscription = createPerformanceObservable({
    type: RumPerformanceEntryType.SOFT_NAVIGATION,
    buffered: false,
  }).subscribe((entries) => {
    if (softNavEntry) {
      return
    }
    softNavEntry = entries[0]

    // The ICP entry for this interaction might have arrived before this soft-navigation entry
    // (Chrome's documented ordering caveat) -- re-scan everything seen so far now that we know
    // our interactionId.
    applyIcpEntries(pendingIcpEntries)
    pendingIcpEntries.length = 0

    const seededIcp = softNavEntry.getLargestInteractionContentfulPaint()
    if (seededIcp) {
      applyIcpEntries([seededIcp])
    }
  })

  function applyIcpEntries(entries: RumInteractionContentfulPaintTiming[]) {
    if (!softNavEntry) {
      return
    }
    for (const entry of entries) {
      if (entry.interactionId !== softNavEntry.interactionId || entry.largestContentfulPaint.size <= biggestIcpSize) {
        continue
      }
      biggestIcpSize = entry.largestContentfulPaint.size
      const lcpEntry = entry.largestContentfulPaint
      const resourceUrl = lcpEntry.url || undefined
      const largestContentfulPaint: LargestContentfulPaint = {
        value: (lcpEntry.startTime - softNavEntry.startTime) as RelativeTime,
        targetSelector: lcpEntry.element
          ? getSelectorFromElement(lcpEntry.element, configuration.actionNameAttribute)
          : undefined,
        resourceUrl,
        subParts: computeLcpSubParts(resourceUrl, lcpEntry.startTime, softNavEntry.startTime),
      }
      initialViewMetrics.largestContentfulPaint = largestContentfulPaint
      scheduleViewUpdate()
    }
  }

  return {
    initialViewMetrics,
    setViewEnd: () => {
      softNavStopped = true
      softNavSubscription.unsubscribe()
    },
    stop: () => {
      if (!softNavStopped) {
        softNavSubscription.unsubscribe()
      }
      icpSubscription.unsubscribe()
    },
  }
}

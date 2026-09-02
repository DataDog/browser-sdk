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
 * Tracks the Largest Contentful Paint (LCP) for a `route_change` view using Chrome's Soft
 * Navigation API. Only called when `ExperimentalFeature.SOFT_NAVIGATION` is enabled and the
 * browser supports the `soft-navigation` performance entry type (see trackViews.ts).
 *
 * One instance of this tracker is created per route_change view (see the spec's "Per-view vs
 * global subscription" section for why). The soft-navigation entry for this view's interaction
 * arrives asynchronously (after Chrome confirms the paint), so `setViewEnd` MUST be called
 * (synchronously, when the view ends) to stop listening for new soft-navigation entries -- ICP
 * entries keep being tracked until `stop()`, since by then this tracker's `interactionId` is
 * already known and used to filter them.
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

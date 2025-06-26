import type { RelativeTime, ClocksState } from '@datadog/browser-core'
import { getNavigationEntry } from '../../../browser/performanceUtils'
import type { InitialViewMetrics } from './trackInitialViewMetrics'

/**
 * For prerendered pages, all timing metrics should be adjusted by subtracting activationStart
 * to get the time relative to when the page became visible to the user.
 */
export function trackPrerenderMetrics(
  viewStart: ClocksState,
  metrics: InitialViewMetrics,
  scheduleViewUpdate: () => void
) {
  const navigationEntry = getNavigationEntry()
  if (!navigationEntry || !navigationEntry.activationStart) {
    return
  }

  const activationStart = navigationEntry.activationStart

  const adjustTiming = (timing: number | undefined): number | undefined => {
    if (timing === undefined) return undefined
    const adjusted = timing - activationStart
    return Math.max(0, adjusted)
  }

  // Adjust all timing metrics relative to activation
  if (metrics.firstContentfulPaint !== undefined) {
    const adjustedFCP = adjustTiming(metrics.firstContentfulPaint)
    if (adjustedFCP !== undefined) {
      metrics.firstContentfulPaint = adjustedFCP as RelativeTime
      scheduleViewUpdate()
    }
  }

  if (metrics.largestContentfulPaint?.value !== undefined) {
    const adjustedLCP = adjustTiming(metrics.largestContentfulPaint.value)
    if (adjustedLCP !== undefined) {
      metrics.largestContentfulPaint = { 
        ...metrics.largestContentfulPaint,
        value: adjustedLCP as RelativeTime 
      }
      scheduleViewUpdate()
    }
  }

  if (metrics.firstInput?.delay !== undefined) {
    const adjustedFID = adjustTiming(metrics.firstInput.delay)
    if (adjustedFID !== undefined) {
      metrics.firstInput = {
        ...metrics.firstInput,
        delay: adjustedFID as RelativeTime
      }
      scheduleViewUpdate()
    }
  }
} 
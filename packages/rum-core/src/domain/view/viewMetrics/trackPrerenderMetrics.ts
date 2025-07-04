import type { RelativeTime, Duration, TimeoutId } from '@datadog/browser-core'
import { setInterval, setTimeout, clearInterval } from '@datadog/browser-core'
import { getActivationStart } from '../../../browser/performanceUtils'
import type { InitialViewMetrics } from './trackInitialViewMetrics'

/**
 * Prerendered pages have their metrics adjusted by subtracting activationStart to reflect
 * user-perceived performance. This function applies timing adjustments to metrics after they are collected.
 */
export function trackPrerenderMetrics(
  metrics: InitialViewMetrics,
  scheduleViewUpdate: () => void,
  getActivationStartImpl = getActivationStart
) {
  const activationStart = getActivationStartImpl()

  if (activationStart <= 0) {
    return
  }

  const adjustmentInterval: TimeoutId = setInterval(() => {
    let hasAdjustments = false

    if (metrics.firstContentfulPaint !== undefined && metrics.firstContentfulPaint >= activationStart) {
      metrics.firstContentfulPaint = Math.max(0, metrics.firstContentfulPaint - activationStart) as Duration
      hasAdjustments = true
    }

    if (metrics.largestContentfulPaint !== undefined && metrics.largestContentfulPaint.value >= activationStart) {
      metrics.largestContentfulPaint = {
        ...metrics.largestContentfulPaint,
        value: Math.max(0, metrics.largestContentfulPaint.value - activationStart) as RelativeTime,
      }
      hasAdjustments = true
    }

    if (metrics.navigationTimings?.firstByte !== undefined && metrics.navigationTimings.firstByte >= activationStart) {
      metrics.navigationTimings = {
        ...metrics.navigationTimings,
        firstByte: Math.max(0, metrics.navigationTimings.firstByte - activationStart) as Duration,
      }
      hasAdjustments = true
    }

    if (hasAdjustments) {
      scheduleViewUpdate()
    }
  }, 100)

  setTimeout(() => {
    clearInterval(adjustmentInterval)
  }, 10000)
}

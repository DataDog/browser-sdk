import type { RelativeTime, Duration, TimeoutId } from '@datadog/browser-core'
import { addEventListener, DOM_EVENT, setInterval, clearInterval, setTimeout, isPrerenderingSupported } from '@datadog/browser-core'
import { getActivationStart } from '../../../browser/performanceUtils'
import type { RumConfiguration } from '../../configuration'
import type { InitialViewMetrics } from './trackInitialViewMetrics'

const METRIC_ADJUSTMENT_MONITORING_INTERVAL = 100
const METRIC_ADJUSTMENT_TIMEOUT = 10_000

/**
 * Track prerender-specific metrics adjustments. For prerendered pages, metrics need to be
 * adjusted relative to activationStart to reflect user-perceived performance.
 *
 * This function waits for page activation and then adjusts timing metrics by subtracting
 * activationStart, ensuring that metrics represent the user experience rather than the
 * prerendering process.
 */
export function trackPrerenderMetrics(
  configuration: RumConfiguration,
  metrics: InitialViewMetrics,
  scheduleViewUpdate: () => void,
  getActivationStartImpl: () => RelativeTime = getActivationStart
) {
  let monitoringInterval: TimeoutId | undefined
  let timeoutId: TimeoutId | undefined

  if (isPrerenderingSupported()) {
    const { stop: stopPrerenderingChange } = addEventListener(
      configuration,
      document,
      'prerenderingchange' as any,
      () => {
        adjustMetricsPostActivation()
        stopPrerenderingChange()
      },
      { once: true }
    )

    const { stop: stopVisibilityChange } = addEventListener(
      configuration,
      document,
      DOM_EVENT.VISIBILITY_CHANGE,
      () => {
        if (document.visibilityState === 'visible') {
          adjustMetricsPostActivation()
          stopVisibilityChange()
        }
      }
    )
  } else {
    adjustMetricsPostActivation()
  }

  function adjustMetricsPostActivation() {
    const activationStart = getActivationStartImpl()

    if (activationStart <= 0) {
      return
    }

    applyMetricAdjustments(activationStart)

    startContinuousMonitoring(activationStart)
  }

  function applyMetricAdjustments(activationStart: RelativeTime): boolean {
    let hasAdjustments = false

    if (metrics.firstContentfulPaint !== undefined) {
      const adjusted = Math.max(0, metrics.firstContentfulPaint - activationStart) as Duration
      if (adjusted !== metrics.firstContentfulPaint) {
        metrics.firstContentfulPaint = adjusted
        hasAdjustments = true
      }
    }

    if (metrics.largestContentfulPaint !== undefined) {
      const adjusted = Math.max(0, metrics.largestContentfulPaint.value - activationStart) as RelativeTime
      if (adjusted !== metrics.largestContentfulPaint.value) {
        metrics.largestContentfulPaint = {
          ...metrics.largestContentfulPaint,
          value: adjusted,
        }
        hasAdjustments = true
      }
    }

    if (metrics.navigationTimings?.firstByte !== undefined) {
      const adjusted = Math.max(0, metrics.navigationTimings.firstByte - activationStart) as Duration
      if (adjusted !== metrics.navigationTimings.firstByte) {
        metrics.navigationTimings = {
          ...metrics.navigationTimings,
          firstByte: adjusted,
        }
        hasAdjustments = true
      }
    }

    if (hasAdjustments) {
      scheduleViewUpdate()
    }

    return hasAdjustments
  }

  function startContinuousMonitoring(activationStart: RelativeTime) {
    monitoringInterval = setInterval(() => {
      applyMetricAdjustments(activationStart)
    }, METRIC_ADJUSTMENT_MONITORING_INTERVAL)

    timeoutId = setTimeout(() => {
      stopMonitoring()
    }, METRIC_ADJUSTMENT_TIMEOUT)
  }

  function stopMonitoring() {
    if (monitoringInterval) {
      clearInterval(monitoringInterval)
      monitoringInterval = undefined
    }
    if (timeoutId) {
      clearInterval(timeoutId)
      timeoutId = undefined
    }
  }
}

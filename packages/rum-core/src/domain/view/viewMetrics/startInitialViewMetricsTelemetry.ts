import type { Context, Telemetry } from '@datadog/browser-core'
import { addTelemetryMetrics, noop, TelemetryMetrics } from '@datadog/browser-core'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import type { LargestContentfulPaint } from './trackLargestContentfulPaint'
import type { NavigationTimings } from './trackNavigationTimings'

interface CoreInitialViewMetrics extends Context {
  lcp: {
    value: number
  }
  navigation: {
    domComplete: number
    domContentLoaded: number
    domInteractive: number
    firstByte: number | undefined
    loadEvent: number
  }
}

export function startInitialViewMetricsTelemetry(lifeCycle: LifeCycle, telemetry: Telemetry) {
  if (!telemetry.metricsEnabled) {
    return { stop: noop }
  }

  const { unsubscribe } = lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, ({ initialViewMetrics }) => {
    if (!initialViewMetrics.largestContentfulPaint || !initialViewMetrics.navigationTimings) {
      return
    }

    // The navigation timings become available shortly after the load event fires, so
    // we're snapshotting the LCP value available at that point. However, more LCP values
    // can be emitted until the page is scrolled or interacted with, so it's possible that
    // the final LCP value may differ. These metrics are intended to help diagnose
    // performance issues early in the page load process, and using LCP-at-page-load is a
    // good fit for that use case, but it's important to be aware that this is not
    // necessarily equivalent to the normal LCP metric.
    // monitor-until: 2026-07-01
    addTelemetryMetrics(TelemetryMetrics.INITIAL_VIEW_METRICS_TELEMETRY_NAME, {
      metrics: createCoreInitialViewMetrics(
        initialViewMetrics.largestContentfulPaint,
        initialViewMetrics.navigationTimings
      ),
    })

    unsubscribe()
  })

  return {
    stop: unsubscribe,
  }
}

function createCoreInitialViewMetrics(
  lcp: LargestContentfulPaint,
  navigation: NavigationTimings
): CoreInitialViewMetrics {
  return {
    lcp: {
      value: lcp.value,
    },
    navigation: {
      domComplete: navigation.domComplete,
      domContentLoaded: navigation.domContentLoaded,
      domInteractive: navigation.domInteractive,
      firstByte: navigation.firstByte,
      loadEvent: navigation.loadEvent,
    },
  }
}

import type { Context, RelativeTime, Telemetry } from '@datadog/browser-core'
import { PageExitReason, performDraw, addTelemetryMetrics, noop, relativeNow } from '@datadog/browser-core'
import { getNavigationEntry } from '../../../browser/performanceUtils'
import { LifeCycleEventType } from '../../lifeCycle'
import type { LifeCycle } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import type { LargestContentfulPaint } from './trackLargestContentfulPaint'
import type { NavigationTimings } from './trackNavigationTimings'

const INITIAL_VIEW_METRICS_TELEMETRY_NAME = 'Initial view metrics'

interface AfterPageLoadInitialViewMetrics extends Context {
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

interface EarlyPageUnloadInitialViewMetrics extends Context {
  earlyPageUnload: {
    domContentLoaded: number | undefined
    timestamp: number
  }
}

export function startInitialViewMetricsTelemetry(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  telemetry: Telemetry
) {
  const initialViewMetricsTelemetryEnabled =
    telemetry.enabled && performDraw(configuration.initialViewMetricsTelemetrySampleRate)
  if (!initialViewMetricsTelemetryEnabled) {
    return { stop: noop }
  }

  const { unsubscribe: unsubscribePageMayExit } = lifeCycle.subscribe(
    LifeCycleEventType.PAGE_MAY_EXIT,
    ({ reason }) => {
      if (reason !== PageExitReason.UNLOADING) {
        return
      }

      const navigationEntry = getNavigationEntry()
      addTelemetryMetrics(INITIAL_VIEW_METRICS_TELEMETRY_NAME, {
        metrics: createEarlyPageUnloadInitialViewMetrics(navigationEntry.domContentLoadedEventEnd, relativeNow()),
      })

      // Only send metrics in response to PAGE_MAY_EXIT once, but keep the subscription to
      // VIEW_UPDATED in case the page doesn't actually exit and we do eventually get
      // final numbers.
      unsubscribePageMayExit()
    }
  )

  const { unsubscribe: unsubscribeViewUpdated } = lifeCycle.subscribe(
    LifeCycleEventType.VIEW_UPDATED,
    ({ initialViewMetrics }) => {
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

      addTelemetryMetrics(INITIAL_VIEW_METRICS_TELEMETRY_NAME, {
        metrics: createAfterPageLoadInitialViewMetrics(
          initialViewMetrics.largestContentfulPaint,
          initialViewMetrics.navigationTimings
        ),
      })

      // Don't send any further metrics.
      unsubscribePageMayExit()
      unsubscribeViewUpdated()
    }
  )

  return {
    stop: () => {
      unsubscribePageMayExit()
      unsubscribeViewUpdated()
    },
  }
}

function createAfterPageLoadInitialViewMetrics(
  lcp: LargestContentfulPaint,
  navigation: NavigationTimings
): AfterPageLoadInitialViewMetrics {
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

function createEarlyPageUnloadInitialViewMetrics(
  domContentLoadedEventEnd: RelativeTime,
  timestamp: RelativeTime
): EarlyPageUnloadInitialViewMetrics {
  return {
    earlyPageUnload: {
      domContentLoaded: domContentLoadedEventEnd > 0 ? domContentLoadedEventEnd : undefined,
      timestamp,
    },
  }
}

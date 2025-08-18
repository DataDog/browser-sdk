import type { Context, Telemetry } from '@datadog/browser-core'
import { performDraw, addTelemetryMetrics, noop } from '@datadog/browser-core'
import { LifeCycleEventType, type LifeCycle } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import type { LargestContentfulPaint } from './trackLargestContentfulPaint'
import type { NavigationTimings } from './trackNavigationTimings'

const INITIAL_VIEW_METRICS_TELEMETRY_NAME = 'Initial view metrics'

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

  const { unsubscribe } = lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, ({ initialViewMetrics }) => {
    if (!initialViewMetrics.largestContentfulPaint || !initialViewMetrics.navigationTimings) {
      return
    }

    addTelemetryMetrics(INITIAL_VIEW_METRICS_TELEMETRY_NAME, {
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

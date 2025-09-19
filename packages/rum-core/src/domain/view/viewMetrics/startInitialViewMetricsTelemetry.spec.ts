import type { Telemetry, RelativeTime, Duration, RawTelemetryEvent } from '@datadog/browser-core'
import type { MockTelemetry } from '@datadog/browser-core/test'
import { registerCleanupTask, startMockTelemetry } from '@datadog/browser-core/test'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import type { ViewEvent } from '../trackViews'
import { startInitialViewMetricsTelemetry } from './startInitialViewMetricsTelemetry'
import type { InitialViewMetrics } from './trackInitialViewMetrics'

const VIEW_METRICS: Partial<InitialViewMetrics> = {
  largestContentfulPaint: {
    value: 100 as RelativeTime,
  },
  navigationTimings: {
    domComplete: 10 as Duration,
    domContentLoaded: 20 as Duration,
    domInteractive: 30 as Duration,
    firstByte: 40 as Duration,
    loadEvent: 50 as Duration,
  },
}

const TELEMETRY_FOR_VIEW_METRICS: RawTelemetryEvent = {
  type: 'log',
  status: 'debug',
  message: 'Initial view metrics',
  metrics: {
    lcp: {
      value: 100,
    },
    navigation: {
      domComplete: 10,
      domContentLoaded: 20,
      domInteractive: 30,
      firstByte: 40,
      loadEvent: 50,
    },
  },
}

describe('startInitialViewMetricsTelemetry', () => {
  const lifeCycle = new LifeCycle()
  let telemetry: MockTelemetry

  function generateViewUpdateWithInitialViewMetrics(initialViewMetrics: Partial<InitialViewMetrics>) {
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { initialViewMetrics } as ViewEvent)
  }

  function startInitialViewMetricsTelemetryCollection(metricsEnabled: boolean = true) {
    telemetry = startMockTelemetry()
    const { stop: stopInitialViewMetricsTelemetryCollection } = startInitialViewMetricsTelemetry(lifeCycle, {
      metricsEnabled,
    } as Telemetry)
    registerCleanupTask(stopInitialViewMetricsTelemetryCollection)
  }

  it('should collect initial view metrics telemetry', async () => {
    startInitialViewMetricsTelemetryCollection()
    generateViewUpdateWithInitialViewMetrics(VIEW_METRICS)
    expect(await telemetry.getEvents()).toEqual([jasmine.objectContaining(TELEMETRY_FOR_VIEW_METRICS)])
  })

  it('should not collect initial view metrics telemetry twice', async () => {
    startInitialViewMetricsTelemetryCollection()

    generateViewUpdateWithInitialViewMetrics(VIEW_METRICS)
    expect(await telemetry.getEvents()).toEqual([jasmine.objectContaining(TELEMETRY_FOR_VIEW_METRICS)])
    telemetry.reset()

    generateViewUpdateWithInitialViewMetrics({
      ...VIEW_METRICS,
      largestContentfulPaint: {
        value: 1000 as RelativeTime,
      },
    })
    expect(await telemetry.hasEvents()).toBe(false)
  })

  it('should not collect initial view metrics telemetry until LCP is known', async () => {
    startInitialViewMetricsTelemetryCollection()

    generateViewUpdateWithInitialViewMetrics({
      ...VIEW_METRICS,
      largestContentfulPaint: undefined,
    })
    expect(await telemetry.hasEvents()).toBe(false)
    telemetry.reset()

    generateViewUpdateWithInitialViewMetrics(VIEW_METRICS)
    expect(await telemetry.getEvents()).toEqual([jasmine.objectContaining(TELEMETRY_FOR_VIEW_METRICS)])
  })

  it('should not collect initial view metrics telemetry until navigation timings are known', async () => {
    startInitialViewMetricsTelemetryCollection()

    generateViewUpdateWithInitialViewMetrics({
      ...VIEW_METRICS,
      navigationTimings: undefined,
    })
    expect(await telemetry.hasEvents()).toBe(false)
    telemetry.reset()

    generateViewUpdateWithInitialViewMetrics(VIEW_METRICS)
    expect(await telemetry.getEvents()).toEqual([jasmine.objectContaining(TELEMETRY_FOR_VIEW_METRICS)])
  })

  it('should not collect initial view metrics telemetry when telemetry is disabled', async () => {
    startInitialViewMetricsTelemetryCollection(false)
    generateViewUpdateWithInitialViewMetrics(VIEW_METRICS)
    expect(await telemetry.hasEvents()).toBe(false)
  })
})

import type { Telemetry, RelativeTime, Duration, RawTelemetryEvent, PageMayExitEvent } from '@datadog/browser-core'
import { PageExitReason } from '@datadog/browser-core'
import type { MockTelemetry } from '@datadog/browser-core/test'
import { registerCleanupTask, startMockTelemetry } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { mockRumConfiguration } from '../../../../test'
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

const TELEMETRY_FOR_EARLY_PAGE_UNLOAD: RawTelemetryEvent = {
  type: 'log',
  status: 'debug',
  message: 'Initial view metrics',
  metrics: {
    earlyPageUnload: {
      domContentLoaded: jasmine.anything(),
      timestamp: jasmine.anything(),
    },
  },
}

describe('startInitialViewMetricsTelemetry', () => {
  const lifeCycle = new LifeCycle()
  let telemetry: MockTelemetry

  const config: Partial<RumConfiguration> = {
    maxTelemetryEventsPerPage: 2,
    initialViewMetricsTelemetrySampleRate: 100,
    telemetrySampleRate: 100,
  }

  function generatePageMayExit(reason: PageExitReason) {
    lifeCycle.notify(LifeCycleEventType.PAGE_MAY_EXIT, { reason } as PageMayExitEvent)
  }

  function generateViewUpdateWithInitialViewMetrics(initialViewMetrics: Partial<InitialViewMetrics>) {
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { initialViewMetrics } as ViewEvent)
  }

  function startInitialViewMetricsTelemetryCollection(partialConfig: Partial<RumConfiguration> = config) {
    const configuration = mockRumConfiguration(partialConfig)
    telemetry = startMockTelemetry()
    const { stop: stopInitialViewMetricsTelemetryCollection } = startInitialViewMetricsTelemetry(
      configuration,
      lifeCycle,
      {
        enabled: true,
      } as Telemetry
    )
    registerCleanupTask(stopInitialViewMetricsTelemetryCollection)
  }

  it('should collect initial view metrics telemetry', async () => {
    startInitialViewMetricsTelemetryCollection()
    generateViewUpdateWithInitialViewMetrics(VIEW_METRICS)
    expect(await telemetry.getEvents()).toEqual([jasmine.objectContaining(TELEMETRY_FOR_VIEW_METRICS)])
  })

  it('should collect minimal initial view metrics telemetry if page unloads early', async () => {
    startInitialViewMetricsTelemetryCollection()
    generatePageMayExit(PageExitReason.UNLOADING)
    expect(await telemetry.getEvents()).toEqual([jasmine.objectContaining(TELEMETRY_FOR_EARLY_PAGE_UNLOAD)])
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

  it('should not collect early page unload telemetry if page is not unloading', async () => {
    startInitialViewMetricsTelemetryCollection()
    generatePageMayExit(PageExitReason.FROZEN)
    generatePageMayExit(PageExitReason.HIDDEN)
    generatePageMayExit(PageExitReason.PAGEHIDE)
    expect(await telemetry.hasEvents()).toBe(false)
  })

  it('should not collect early page unload telemetry if initial view metrics were already collected', async () => {
    startInitialViewMetricsTelemetryCollection()

    generateViewUpdateWithInitialViewMetrics(VIEW_METRICS)
    expect(await telemetry.getEvents()).toEqual([jasmine.objectContaining(TELEMETRY_FOR_VIEW_METRICS)])
    telemetry.reset()

    generatePageMayExit(PageExitReason.UNLOADING)
    expect(await telemetry.hasEvents()).toBe(false)
  })

  it('should collect initial view metrics even if page unload telemetry was already collected', async () => {
    startInitialViewMetricsTelemetryCollection()

    generatePageMayExit(PageExitReason.UNLOADING)
    expect(await telemetry.getEvents()).toEqual([jasmine.objectContaining(TELEMETRY_FOR_EARLY_PAGE_UNLOAD)])
    telemetry.reset()

    generateViewUpdateWithInitialViewMetrics(VIEW_METRICS)
    expect(await telemetry.getEvents()).toEqual([jasmine.objectContaining(TELEMETRY_FOR_VIEW_METRICS)])
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
    startInitialViewMetricsTelemetryCollection({
      telemetrySampleRate: 100,
      initialViewMetricsTelemetrySampleRate: 0,
    })
    generateViewUpdateWithInitialViewMetrics(VIEW_METRICS)
    expect(await telemetry.hasEvents()).toBe(false)
    generatePageMayExit(PageExitReason.UNLOADING)
    expect(await telemetry.hasEvents()).toBe(false)
  })
})

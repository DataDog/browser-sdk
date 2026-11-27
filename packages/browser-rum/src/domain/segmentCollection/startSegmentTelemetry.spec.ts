import type { Telemetry, HttpRequestEvent, BandwidthStats } from '@datadog/browser-core'
import { Observable } from '@datadog/js-core/util'
import type { MockTelemetry } from '@datadog/browser-core/test'
import { registerCleanupTask, startMockTelemetry } from '@datadog/browser-core/test'
import { startSegmentTelemetry } from './startSegmentTelemetry'
import type { ReplayPayload } from './buildReplayPayload'

describe('segmentTelemetry', () => {
  let requestObservable: Observable<HttpRequestEvent<ReplayPayload>>
  let telemetry: MockTelemetry
  let stopSegmentTelemetry: (() => void) | undefined

  function generateReplayRequest({
    result,
    isFullSnapshot,
    retry,
    endpointResponded = true,
  }: {
    result: 'failure' | 'queue-full' | 'success'
    isFullSnapshot: boolean
    retry?: ReplayPayload['retry']
    endpointResponded?: boolean
  }) {
    const bandwidth: BandwidthStats = {
      ongoingByteCount: 3000,
      ongoingRequestCount: 2,
    }
    const payload: ReplayPayload = {
      data: '',
      bytesCount: 1000,
      cssText: {
        count: 2,
        max: 300,
        sum: 500,
      },
      isFullSnapshot,
      rawSize: 2000,
      recordCount: 3,
      serializationDuration: {
        count: 3,
        max: 65,
        sum: 105,
      },
      retry,
    }
    requestObservable.notify({ type: result, bandwidth, endpointResponded, payload })
  }

  function setupSegmentTelemetryCollection({
    metricsEnabled = true,
    useProxy = false,
  }: { metricsEnabled?: boolean; useProxy?: boolean } = {}) {
    requestObservable = new Observable()
    telemetry = startMockTelemetry()
    ;({ stop: stopSegmentTelemetry } = startSegmentTelemetry(
      { metricsEnabled } as Telemetry,
      requestObservable,
      useProxy
    ))
    registerCleanupTask(stopSegmentTelemetry)
  }

  it('should collect segment telemetry for all full snapshots', async () => {
    setupSegmentTelemetryCollection()

    for (const result of ['failure', 'queue-full', 'success'] as const) {
      generateReplayRequest({ result, isFullSnapshot: true })

      expect(await telemetry.getEvents()).toEqual([
        jasmine.objectContaining({
          type: 'log',
          status: 'debug',
          message: 'Segment network request metrics',
          metrics: {
            cssText: {
              count: 2,
              max: 300,
              sum: 500,
            },
            encoding: {
              fullSnapshot: 'change',
              incrementalSnapshot: 'change',
            },
            endpointResponded: true,
            isFullSnapshot: true,
            ongoingRequests: {
              count: 2,
              totalSize: 3000,
            },
            recordCount: 3,
            result,
            size: {
              compressed: 1000,
              raw: 2000,
            },
            serializationDuration: {
              count: 3,
              max: 65,
              sum: 105,
            },
            useProxy: false,
          },
        }),
      ])

      telemetry.reset()
    }
  })

  it('should collect segment telemetry for failed incremental mutation requests', async () => {
    setupSegmentTelemetryCollection()

    for (const result of ['failure', 'queue-full'] as const) {
      generateReplayRequest({ result, isFullSnapshot: false })

      expect(await telemetry.getEvents()).toEqual([
        jasmine.objectContaining({
          type: 'log',
          status: 'debug',
          message: 'Segment network request metrics',
          metrics: {
            cssText: {
              count: 2,
              max: 300,
              sum: 500,
            },
            encoding: {
              fullSnapshot: 'change',
              incrementalSnapshot: 'change',
            },
            endpointResponded: true,
            isFullSnapshot: false,
            ongoingRequests: {
              count: 2,
              totalSize: 3000,
            },
            recordCount: 3,
            result,
            size: {
              compressed: 1000,
              raw: 2000,
            },
            serializationDuration: {
              count: 3,
              max: 65,
              sum: 105,
            },
            useProxy: false,
          },
        }),
      ])

      telemetry.reset()
    }
  })

  it('should collect retry info when the request was retried', async () => {
    setupSegmentTelemetryCollection()
    generateReplayRequest({ result: 'failure', isFullSnapshot: false, retry: { count: 2, lastFailureStatus: 0 } })

    expect(await telemetry.getEvents()).toEqual([
      jasmine.objectContaining({
        metrics: jasmine.objectContaining({ retry: { count: 2, lastFailureStatus: 0 } }),
      }),
    ])
  })

  it('should collect whether the endpoint has responded', async () => {
    setupSegmentTelemetryCollection()
    generateReplayRequest({ result: 'success', isFullSnapshot: true, endpointResponded: false })

    expect(await telemetry.getEvents()).toEqual([
      jasmine.objectContaining({
        metrics: jasmine.objectContaining({ endpointResponded: false }),
      }),
    ])
  })

  it('should collect whether the SDK uses a proxy', async () => {
    setupSegmentTelemetryCollection({ useProxy: true })
    generateReplayRequest({ result: 'success', isFullSnapshot: true })

    expect(await telemetry.getEvents()).toEqual([
      jasmine.objectContaining({
        metrics: jasmine.objectContaining({ useProxy: true }),
      }),
    ])
  })

  it('should collect segment telemetry for successful incremental mutation requests that were retried', async () => {
    setupSegmentTelemetryCollection()
    generateReplayRequest({ result: 'success', isFullSnapshot: false, retry: { count: 3, lastFailureStatus: 0 } })

    expect(await telemetry.getEvents()).toEqual([
      jasmine.objectContaining({
        metrics: jasmine.objectContaining({ result: 'success', retry: { count: 3, lastFailureStatus: 0 } }),
      }),
    ])
  })

  it('should not collect segment telemetry for successful incremental mutation requests that were not retried', async () => {
    setupSegmentTelemetryCollection()
    generateReplayRequest({ result: 'success', isFullSnapshot: false })
    expect(await telemetry.hasEvents()).toBe(false)
  })

  it('should not collect segment when telemetry disabled', async () => {
    setupSegmentTelemetryCollection({ metricsEnabled: false })
    generateReplayRequest({ result: 'success', isFullSnapshot: true })
    expect(await telemetry.hasEvents()).toBe(false)
  })
})

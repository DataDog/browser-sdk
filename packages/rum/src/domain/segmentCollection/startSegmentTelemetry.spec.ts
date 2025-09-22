import type { Telemetry, HttpRequestEvent, BandwidthStats } from '@datadog/browser-core'
import { Observable } from '@datadog/browser-core'
import type { MockTelemetry } from '@datadog/browser-core/test'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { startMockTelemetry } from '../../../../core/test'
import { startSegmentTelemetry } from './startSegmentTelemetry'
import type { ReplayPayload } from './buildReplayPayload'

describe('segmentTelemetry', () => {
  let requestObservable: Observable<HttpRequestEvent<ReplayPayload>>
  let telemetry: MockTelemetry
  let stopSegmentTelemetry: (() => void) | undefined

  function generateReplayRequest({
    result,
    isFullSnapshot,
  }: {
    result: 'failure' | 'queue-full' | 'success'
    isFullSnapshot: boolean
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
    }
    requestObservable.notify({ type: result, bandwidth, payload })
  }

  function setupSegmentTelemetryCollection(metricsEnabled: boolean = true) {
    requestObservable = new Observable()
    telemetry = startMockTelemetry()
    ;({ stop: stopSegmentTelemetry } = startSegmentTelemetry({ metricsEnabled } as Telemetry, requestObservable))
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
          },
        }),
      ])

      telemetry.reset()
    }
  })

  it('should not collect segment telemetry for successful incremental mutation requests', async () => {
    setupSegmentTelemetryCollection()
    generateReplayRequest({ result: 'success', isFullSnapshot: false })
    expect(await telemetry.hasEvents()).toBe(false)
  })

  it('should not collect segment when telemetry disabled', async () => {
    setupSegmentTelemetryCollection(false)
    generateReplayRequest({ result: 'success', isFullSnapshot: true })
    expect(await telemetry.hasEvents()).toBe(false)
  })
})

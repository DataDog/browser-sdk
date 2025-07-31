import type { Telemetry, RawTelemetryEvent, HttpRequestEvent, BandwidthStats } from '@datadog/browser-core'
import { Observable, startFakeTelemetry } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { mockRumConfiguration } from '@datadog/browser-rum-core/test'
import { startSegmentTelemetry } from './startSegmentTelemetry'
import type { ReplayPayload } from './buildReplayPayload'

describe('segmentTelemetry', () => {
  let requestObservable: Observable<HttpRequestEvent<ReplayPayload>>
  let telemetryEvents: RawTelemetryEvent[]
  let stopSegmentTelemetry: (() => void) | undefined

  const config: Partial<RumConfiguration> = {
    maxTelemetryEventsPerPage: 2,
    segmentTelemetrySampleRate: 100,
    telemetrySampleRate: 100,
  }

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
    }
    requestObservable.notify({ type: result, bandwidth, payload })
  }

  function setupSegmentTelemetryCollection(partialConfig: Partial<RumConfiguration> = config) {
    const configuration = mockRumConfiguration(partialConfig)
    requestObservable = new Observable()
    telemetryEvents = startFakeTelemetry()
    ;({ stop: stopSegmentTelemetry } = startSegmentTelemetry(
      configuration,
      { enabled: true } as Telemetry,
      requestObservable
    ))
    registerCleanupTask(stopSegmentTelemetry)
  }

  it('should collect segment telemetry for all full snapshots', () => {
    setupSegmentTelemetryCollection()

    for (const result of ['failure', 'queue-full', 'success'] as const) {
      generateReplayRequest({ result, isFullSnapshot: true })

      expect(telemetryEvents.length).toEqual(1)
      expect(telemetryEvents[0]).toEqual(
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
          },
        })
      )

      telemetryEvents.length = 0
    }
  })

  it('should collect segment telemetry for failed incremental mutation requests', () => {
    setupSegmentTelemetryCollection()

    for (const result of ['failure', 'queue-full'] as const) {
      generateReplayRequest({ result, isFullSnapshot: false })

      expect(telemetryEvents.length).toEqual(1)
      expect(telemetryEvents[0]).toEqual(
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
          },
        })
      )

      telemetryEvents.length = 0
    }
  })

  it('should not collect segment telemetry for successful incremental mutation requests', () => {
    setupSegmentTelemetryCollection()
    generateReplayRequest({ result: 'success', isFullSnapshot: false })
    expect(telemetryEvents.length).toEqual(0)
  })

  it('should not collect segment when telemetry disabled', () => {
    setupSegmentTelemetryCollection({
      telemetrySampleRate: 100,
      segmentTelemetrySampleRate: 0,
    })
    generateReplayRequest({ result: 'success', isFullSnapshot: true })
    expect(telemetryEvents.length).toEqual(0)
  })
})

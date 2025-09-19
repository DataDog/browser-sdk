import type { BandwidthStats, Context, HttpRequestEvent, Observable, Telemetry } from '@datadog/browser-core'
import { performDraw, addTelemetryMetrics, noop } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { ReplayPayload } from './buildReplayPayload'

const SEGMENT_METRICS_TELEMETRY_NAME = 'Segment network request metrics'

interface SegmentMetrics extends Context {
  cssText: {
    count: number
    max: number
    sum: number
  }
  isFullSnapshot: boolean
  ongoingRequests: {
    count: number
    totalSize: number
  }
  recordCount: number
  result: 'failure' | 'queue-full' | 'success'
  serializationDuration: {
    count: number
    max: number
    sum: number
  }
  size: {
    compressed: number
    raw: number
  }
}

export function startSegmentTelemetry(
  configuration: RumConfiguration,
  telemetry: Telemetry,
  requestObservable: Observable<HttpRequestEvent<ReplayPayload>>
) {
  const segmentTelemetryEnabled = telemetry.enabled && performDraw(configuration.replayTelemetrySampleRate)
  if (!segmentTelemetryEnabled) {
    return { stop: noop }
  }

  const { unsubscribe } = requestObservable.subscribe((requestEvent) => {
    if (
      requestEvent.type === 'failure' ||
      requestEvent.type === 'queue-full' ||
      (requestEvent.type === 'success' && requestEvent.payload.isFullSnapshot)
    ) {
      const metrics = createSegmentMetrics(requestEvent.type, requestEvent.bandwidth, requestEvent.payload)
      // monitor-until: forever
      addTelemetryMetrics(SEGMENT_METRICS_TELEMETRY_NAME, { metrics })
    }
  })

  return {
    stop: unsubscribe,
  }
}

function createSegmentMetrics(
  result: SegmentMetrics['result'],
  bandwidthStats: BandwidthStats,
  payload: ReplayPayload
): SegmentMetrics {
  return {
    cssText: {
      count: payload.cssText.count,
      max: payload.cssText.max,
      sum: payload.cssText.sum,
    },
    isFullSnapshot: payload.isFullSnapshot,
    ongoingRequests: {
      count: bandwidthStats.ongoingRequestCount,
      totalSize: bandwidthStats.ongoingByteCount,
    },
    recordCount: payload.recordCount,
    result,
    serializationDuration: {
      count: payload.serializationDuration.count,
      max: payload.serializationDuration.max,
      sum: payload.serializationDuration.sum,
    },
    size: {
      compressed: payload.bytesCount,
      raw: payload.rawSize,
    },
  }
}

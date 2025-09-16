import type { BandwidthStats, Context, HttpRequestEvent, Observable, Telemetry } from '@datadog/browser-core'
import { addTelemetryMetrics, noop } from '@datadog/browser-core'
import { SEGMENT_METRICS_TELEMETRY_NAME } from '../replayTelemetryConstants'
import type { ReplayPayload } from './buildReplayPayload'

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
  telemetry: Telemetry,
  requestObservable: Observable<HttpRequestEvent<ReplayPayload>>
) {
  const segmentTelemetryEnabled = telemetry.enabledMetrics[SEGMENT_METRICS_TELEMETRY_NAME]
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

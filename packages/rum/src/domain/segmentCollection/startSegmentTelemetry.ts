import type { BandwidthStats, Context, HttpRequestEvent, Observable, Telemetry } from '@datadog/browser-core'
import { performDraw, addTelemetryDebug, noop } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { ReplayPayload } from './buildReplayPayload'

const SEGMENT_METRICS_TELEMETRY_NAME = 'Segment network request metrics'

interface SegmentMetrics extends Context {
  result: 'failure' | 'queue-full' | 'success'
  isFullSnapshot: boolean

  recordCount: number
  compressedSize: number
  rawSize: number

  cssTextCount: number
  cssTextSizeMax: number
  cssTextSizeSum: number

  ongoingByteCount: number
  ongoingRequestCount: number
}

export function startSegmentTelemetry(
  configuration: RumConfiguration,
  telemetry: Telemetry,
  requestObservable: Observable<HttpRequestEvent<ReplayPayload>>
) {
  const segmentTelemetryEnabled = telemetry.enabled && performDraw(configuration.segmentTelemetrySampleRate)
  if (!segmentTelemetryEnabled) {
    return { stop: noop }
  }

  const { unsubscribe } = requestObservable.subscribe((event) => {
    const payload = event.payload
    if (
      event.type === 'failure' ||
      event.type === 'queue-full' ||
      (event.type === 'success' && payload.isFullSnapshot)
    ) {
      const metrics = createSegmentMetrics(event.type, event.bandwidth, payload)
      addTelemetryDebug(SEGMENT_METRICS_TELEMETRY_NAME, metrics)
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
    result,
    isFullSnapshot: payload.isFullSnapshot,
    cssTextCount: payload.cssText.count,
    recordCount: payload.recordCount,
    compressedSize: payload.bytesCount,
    cssTextSizeMax: payload.cssText.max,
    cssTextSizeSum: payload.cssText.sum,
    rawSize: payload.rawSize,
    ongoingByteCount: bandwidthStats.ongoingByteCount,
    ongoingRequestCount: bandwidthStats.ongoingRequestCount,
  }
}

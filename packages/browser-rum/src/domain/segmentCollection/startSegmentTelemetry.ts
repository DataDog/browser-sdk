import type { BandwidthStats, HttpRequestEvent, Telemetry } from '@datadog/browser-core'
import type { Observable, Context } from '@datadog/js-core/util'
import { noop } from '@datadog/js-core/util'
import { TelemetryMetrics, addTelemetryMetrics } from '@datadog/browser-core'
import type { ReplayPayload } from './buildReplayPayload'

interface SegmentMetrics extends Context {
  cssText: {
    count: number
    max: number
    sum: number
  }
  encoding: {
    fullSnapshot: 'v1' | 'change'
    incrementalSnapshot: 'v1' | 'change'
  }
  endpointResponded: boolean
  isFullSnapshot: boolean
  ongoingRequests: {
    count: number
    totalSize: number
  }
  recordCount: number
  result: 'failure' | 'queue-full' | 'success'
  retry?: {
    count: number
    lastFailureStatus: number
  }
  serializationDuration: {
    count: number
    max: number
    sum: number
  }
  size: {
    compressed: number
    raw: number
  }
  useProxy: boolean
}

export function startSegmentTelemetry(
  telemetry: Telemetry,
  requestObservable: Observable<HttpRequestEvent<ReplayPayload>>,
  useProxy: boolean
) {
  if (!telemetry.metricsEnabled) {
    return { stop: noop }
  }

  const { unsubscribe } = requestObservable.subscribe((requestEvent) => {
    if (
      requestEvent.type === 'failure' ||
      requestEvent.type === 'queue-full' ||
      // Success is the common case, so we report it only for interesting situations:
      // full snapshots (since they're critical) and retried requests (since knowing if
      // they succeed helps us evaluate whether retries are effective).
      (requestEvent.type === 'success' &&
        (requestEvent.payload.isFullSnapshot || requestEvent.payload.retry !== undefined))
    ) {
      const metrics = createSegmentMetrics(
        requestEvent.type,
        requestEvent.bandwidth,
        requestEvent.endpointResponded,
        useProxy,
        requestEvent.payload
      )
      // monitor-until: forever
      addTelemetryMetrics(TelemetryMetrics.SEGMENT_METRICS_TELEMETRY_NAME, { metrics })
    }
  })

  return {
    stop: unsubscribe,
  }
}

function createSegmentMetrics(
  result: SegmentMetrics['result'],
  bandwidthStats: BandwidthStats,
  endpointResponded: boolean,
  useProxy: boolean,
  payload: ReplayPayload
): SegmentMetrics {
  return {
    cssText: {
      count: payload.cssText.count,
      max: payload.cssText.max,
      sum: payload.cssText.sum,
    },
    encoding: {
      fullSnapshot: 'change',
      incrementalSnapshot: 'change',
    },
    endpointResponded,
    isFullSnapshot: payload.isFullSnapshot,
    ongoingRequests: {
      count: bandwidthStats.ongoingRequestCount,
      totalSize: bandwidthStats.ongoingByteCount,
    },
    recordCount: payload.recordCount,
    result,
    ...(payload.retry && {
      retry: {
        count: payload.retry.count,
        lastFailureStatus: payload.retry.lastFailureStatus,
      },
    }),
    serializationDuration: {
      count: payload.serializationDuration.count,
      max: payload.serializationDuration.max,
      sum: payload.serializationDuration.sum,
    },
    size: {
      compressed: payload.bytesCount,
      raw: payload.rawSize,
    },
    useProxy,
  }
}

import type { HttpRequest, Payload, DeflateEncoder, Telemetry, SessionManager } from '@datadog/browser-core'
import { createHttpRequest, addTelemetryDebug, canUseEventBridge, noop, ErrorSource } from '@datadog/browser-core'
import { clocksNow } from '@datadog/js-core/time'
import { createEndpointBuilder } from '@datadog/js-core/transport'
import type { LifeCycle, ViewHistory, RumConfiguration } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'

import type { EmitResourceCallback, SerializationStats } from '../domain/record'
import { record } from '../domain/record'
import type { ReplayPayload } from '../domain/segmentCollection'
import {
  startSegmentCollection,
  SEGMENT_BYTES_LIMIT,
  startSegmentTelemetry,
  startReplayResourceCollection,
} from '../domain/segmentCollection'
import type { BrowserRecord } from '../types'
import { startRecordBridge } from '../domain/startRecordBridge'

export function startRecording(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  sessionManager: SessionManager,
  viewHistory: ViewHistory,
  encoder: DeflateEncoder,
  telemetry: Telemetry,
  httpRequest?: HttpRequest<ReplayPayload>,
  canvasHttpRequest?: HttpRequest<Payload>
) {
  const cleanupTasks: Array<() => void> = []

  const reportError = (message: string) => {
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, {
      error: { message, source: ErrorSource.AGENT, startClocks: clocksNow() },
    })
    // monitor-until: forever, to keep an eye on the errors reported to customers
    addTelemetryDebug('Error reported to customer', { 'error.message': message })
  }

  const replayRequest =
    httpRequest || createHttpRequest([createEndpointBuilder(configuration, 'replay')], reportError, SEGMENT_BYTES_LIMIT)

  const canvasResourceRequest =
    canvasHttpRequest ||
    createHttpRequest([createEndpointBuilder(configuration, 'replay')], reportError, SEGMENT_BYTES_LIMIT)

  let addRecord: (record: BrowserRecord) => void
  let addStats: (stats: SerializationStats) => void
  let emitResource: EmitResourceCallback = noop
  let flushMutations = noop

  // This must be registered before the segment and resource collectors so an urgent exit includes queued canvas changes.
  const { unsubscribe: unsubscribeMutationFlush } = lifeCycle.subscribe(LifeCycleEventType.PREPARE_URGENT_FLUSH, () =>
    flushMutations()
  )
  cleanupTasks.push(unsubscribeMutationFlush)

  if (!canUseEventBridge()) {
    const segmentCollection = startSegmentCollection(
      lifeCycle,
      configuration,
      sessionManager,
      viewHistory,
      replayRequest,
      encoder
    )
    addRecord = segmentCollection.addRecord
    addStats = segmentCollection.addStats
    cleanupTasks.push(segmentCollection.stop)

    const segmentTelemetry = startSegmentTelemetry(telemetry, replayRequest.observable)
    cleanupTasks.push(segmentTelemetry.stop)

    const replayResourceCollection = startReplayResourceCollection(
      configuration.applicationId,
      lifeCycle,
      canvasResourceRequest
    )
    emitResource = replayResourceCollection.emitResource
    cleanupTasks.push(replayResourceCollection.stop)
  } else {
    ;({ addRecord } = startRecordBridge(viewHistory))
    addStats = noop
  }

  const recording = record({
    emitRecord: addRecord,
    emitResource,
    emitStats: addStats,
    configuration,
    lifeCycle,
    viewHistory,
  })
  flushMutations = recording.flushMutations
  cleanupTasks.push(recording.stop)

  return {
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
  }
}

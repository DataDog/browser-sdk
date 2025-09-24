import type { RawError, HttpRequest, DeflateEncoder, Telemetry } from '@datadog/browser-core'
import { createHttpRequest, addTelemetryDebug, canUseEventBridge } from '@datadog/browser-core'
import type { LifeCycle, ViewHistory, RumConfiguration, RumSessionManager } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'

import type { SerializationStats } from '../domain/record'
import { record } from '../domain/record'
import type { ReplayPayload } from '../domain/segmentCollection'
import { startSegmentCollection, SEGMENT_BYTES_LIMIT, startSegmentTelemetry } from '../domain/segmentCollection'
import type { BrowserRecord } from '../types'
import { startRecordBridge } from '../domain/startRecordBridge'

export function startRecording(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  viewHistory: ViewHistory,
  encoder: DeflateEncoder,
  telemetry: Telemetry,
  httpRequest?: HttpRequest<ReplayPayload>
) {
  const cleanupTasks: Array<() => void> = []

  const reportError = (error: RawError) => {
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error })
    // monitor-until: forever, to keep an eye on the errors reported to customers
    addTelemetryDebug('Error reported to customer', { 'error.message': error.message })
  }

  const replayRequest =
    httpRequest || createHttpRequest([configuration.sessionReplayEndpointBuilder], SEGMENT_BYTES_LIMIT, reportError)

  let addRecord: (record: BrowserRecord, stats?: SerializationStats) => void

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
    cleanupTasks.push(segmentCollection.stop)

    const segmentTelemetry = startSegmentTelemetry(telemetry, replayRequest.observable)
    cleanupTasks.push(segmentTelemetry.stop)
  } else {
    ;({ addRecord } = startRecordBridge(viewHistory))
  }

  const { stop: stopRecording } = record({
    emit: addRecord,
    configuration,
    lifeCycle,
    viewHistory,
  })
  cleanupTasks.push(stopRecording)

  return {
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
  }
}

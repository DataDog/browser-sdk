import type { RawError, HttpRequest, DeflateEncoder } from '@datadog/browser-core'
import { createHttpRequest, addTelemetryDebug, canUseEventBridge } from '@datadog/browser-core'
import type {
  LifeCycle,
  ViewHistory,
  RumConfiguration,
  RumSessionManager,
  ReplayStatsHistory,
} from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'

import { record } from '../domain/record'
import { startSegmentCollection, SEGMENT_BYTES_LIMIT } from '../domain/segmentCollection'
import type { BrowserRecord } from '../types'
import { startRecordBridge } from '../domain/startRecordBridge'

export function startRecording(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  replayStatsHistory: ReplayStatsHistory,
  viewHistory: ViewHistory,
  encoder: DeflateEncoder,
  httpRequest?: HttpRequest
) {
  const cleanupTasks: Array<() => void> = []

  const reportError = (error: RawError) => {
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error })
    addTelemetryDebug('Error reported to customer', { 'error.message': error.message })
  }

  const replayRequest =
    httpRequest || createHttpRequest(configuration.sessionReplayEndpointBuilder, SEGMENT_BYTES_LIMIT, reportError)

  let addRecord: (record: BrowserRecord) => void

  if (!canUseEventBridge()) {
    const segmentCollection = startSegmentCollection(
      lifeCycle,
      configuration,
      sessionManager,
      replayStatsHistory,
      viewHistory,
      replayRequest,
      encoder
    )
    addRecord = segmentCollection.addRecord
    cleanupTasks.push(segmentCollection.stop)
  } else {
    ;({ addRecord } = startRecordBridge(viewHistory))
  }

  const { stop: stopRecording } = record({
    emit: addRecord,
    configuration,
    lifeCycle,
    replayStatsHistory,
    viewHistory,
  })
  cleanupTasks.push(stopRecording)

  return {
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
  }
}

import type { HttpRequest, DeflateEncoder, Telemetry, SessionManager } from '@datadog/browser-core'
import {
  createHttpRequest,
  addTelemetryDebug,
  canUseEventBridge,
  noop,
  createEndpointBuilder,
  ErrorSource,
} from '@datadog/browser-core'
import { clocksNow } from '@datadog/js-core/time'
import type { LifeCycle, ViewHistory, RumConfiguration } from '@datadog/browser-rum-core'
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
  sessionManager: SessionManager,
  viewHistory: ViewHistory,
  encoder: DeflateEncoder,
  telemetry: Telemetry,
  httpRequest?: HttpRequest<ReplayPayload>
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

  let addRecord: (record: BrowserRecord) => void
  let addStats: (stats: SerializationStats) => void

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
  } else {
    ;({ addRecord } = startRecordBridge(viewHistory))
    addStats = noop
  }

  const { stop: stopRecording } = record({
    emitRecord: addRecord,
    emitStats: addStats,
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

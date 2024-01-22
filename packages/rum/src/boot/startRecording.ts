import type { RawError, HttpRequest, DeflateEncoder } from '@datadog/browser-core'
import { createHttpRequest, addTelemetryDebug, noop, canUseEventBridge } from '@datadog/browser-core'
import type { LifeCycle, ViewContexts, RumConfiguration, RumSessionManager } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'

import { record } from '../domain/record'
import { startSegmentCollection, SEGMENT_BYTES_LIMIT } from '../domain/segmentCollection'
import type { BrowserRecord } from '../types'
import { startRecordBridge } from '../domain/startRecordBridge'

export function startRecording(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  viewContexts: ViewContexts,
  encoder: DeflateEncoder,
  httpRequest?: HttpRequest
) {
  const reportError = (error: RawError) => {
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error })
    addTelemetryDebug('Error reported to customer', { 'error.message': error.message })
  }

  const replayRequest =
    httpRequest ||
    createHttpRequest(configuration, configuration.sessionReplayEndpointBuilder, SEGMENT_BYTES_LIMIT, reportError)

  let addRecord = (_record: BrowserRecord) => {}
  let stopSegmentCollection = noop

  if (!canUseEventBridge()) {
    ;({ addRecord, stop: stopSegmentCollection } = startSegmentCollection(
      lifeCycle,
      configuration,
      sessionManager,
      viewContexts,
      replayRequest,
      encoder
    ))
  } else {
    ;({ addRecord } = startRecordBridge(viewContexts))
  }

  const { stop: stopRecording } = record({
    emit: addRecord,
    configuration,
    lifeCycle,
    viewContexts,
  })

  return {
    stop: () => {
      stopRecording()
      stopSegmentCollection()
    },
  }
}

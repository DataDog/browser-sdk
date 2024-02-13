import type { RawError, HttpRequest, DeflateEncoder } from '@datadog/browser-core'
import { createHttpRequest, addTelemetryDebug } from '@datadog/browser-core'
import type { LifeCycle, ViewContexts, RumConfiguration, RumSessionManager } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'

import { record } from '../domain/record'
import { startSegmentCollection, SEGMENT_BYTES_LIMIT } from '../domain/segmentCollection'

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

  const { addRecord, stop: stopSegmentCollection } = startSegmentCollection(
    lifeCycle,
    configuration,
    sessionManager,
    viewContexts,
    replayRequest,
    encoder
  )

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

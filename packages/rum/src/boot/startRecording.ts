import type { RawError, HttpRequest, DeflateEncoder } from '@datadog/browser-core'
import { createHttpRequest, addTelemetryDebug, canUseEventBridge, noop } from '@datadog/browser-core'
import type { LifeCycle, ViewHistory, RumConfiguration, RumSessionManager } from '@datadog/browser-rum-core'
import { LifeCycleEventType, SessionReplayState } from '@datadog/browser-rum-core'

import { record } from '../domain/record'
import { startSegmentCollection, SEGMENT_BYTES_LIMIT } from '../domain/segmentCollection'
import type { BrowserRecord } from '../types'
import { startRecordBridge } from '../domain/startRecordBridge'
import { startRecordsCaching } from '../domain/recordsCaching'

export function startRecording(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
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
    httpRequest ||
    createHttpRequest(configuration, configuration.sessionReplayEndpointBuilder, SEGMENT_BYTES_LIMIT, reportError)

  let addRecord: (record: BrowserRecord) => void
  let flushCachedRecords: () => void = noop

  const initSegmentCollection = () => {
    const segmentCollection = startSegmentCollection(
      lifeCycle,
      configuration,
      sessionManager,
      viewHistory,
      replayRequest,
      encoder
    )
    cleanupTasks.push(segmentCollection.stop)
    return { addRecord: segmentCollection.addRecord }
  }

  if (!canUseEventBridge()) {
    const session = sessionManager.findTrackedSession()!
    if (session.sessionReplay === SessionReplayState.OFF) {
      const cacheInitResult = startRecordsCaching()
      addRecord = cacheInitResult.addRecord

      flushCachedRecords = () => {
        ;({ addRecord } = initSegmentCollection())
        cacheInitResult.squashCachedRecords()
        const records = cacheInitResult.getRecords()
        records.forEach((record: BrowserRecord) => addRecord(record))
      }
    } else {
      ;({ addRecord } = initSegmentCollection())
    }
  } else {
    ;({ addRecord } = startRecordBridge(viewHistory))
  }

  const { stop: stopRecording } = record({
    emit: (record) => addRecord(record),
    configuration,
    lifeCycle,
    viewHistory,
  })
  cleanupTasks.push(stopRecording)

  return {
    flushCachedRecords,
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
  }
}

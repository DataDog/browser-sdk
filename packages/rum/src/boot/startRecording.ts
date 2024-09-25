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

  const initSegemntCollection = () => {
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

  const initRecordsCollectionAndForwarding = () => {
    const session = sessionManager.findTrackedSession()!
    let shouldCache = session.sessionReplay === SessionReplayState.OFF

    const { addRecord: addToCache, getRecords: getFromCache } = startRecordsCaching()
    const { addRecord: addToSegment } = initSegemntCollection()

    const addRecord = (record: BrowserRecord) => {
      if (shouldCache) {
        addToCache(record)
      } else {
        addToSegment(record)
      }
    }

    const flushCachedRecords = () => {
      if (shouldCache) {
        shouldCache = false
        const records = getFromCache()
        records.forEach(addToSegment)
      }
    }

    return { addRecord, flushCachedRecords }
  }

  if (!canUseEventBridge()) {
    ;({ addRecord, flushCachedRecords } = initRecordsCollectionAndForwarding())
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
    flushCachedRecords,
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
  }
}

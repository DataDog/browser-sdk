import type { RawError, HttpRequest } from '@datadog/browser-core'
import { timeStampNow, createHttpRequest } from '@datadog/browser-core'
import type {
  LifeCycle,
  ViewContexts,
  RumConfiguration,
  RumSessionManager,
  ViewCreatedEvent,
} from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'

import { record } from '../domain/record'
import type { DeflateWorker } from '../domain/segmentCollection'
import { startSegmentCollection, SEGMENT_BYTES_LIMIT } from '../domain/segmentCollection'
import { RecordType } from '../types'

export function startRecording(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  viewContexts: ViewContexts,
  worker: DeflateWorker,
  httpRequest?: HttpRequest
) {
  const reportError = (error: RawError) => {
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error })
  }

  const replayRequest =
    httpRequest || createHttpRequest(configuration.sessionReplayEndpointBuilder, SEGMENT_BYTES_LIMIT, reportError)

  const { addRecord, stop: stopSegmentCollection } = startSegmentCollection(
    lifeCycle,
    configuration.applicationId,
    sessionManager,
    viewContexts,
    replayRequest,
    worker
  )

  const {
    stop: stopRecording,
    takeSubsequentFullSnapshot,
    flushMutations,
  } = record({
    emit: addRecord,
    configuration,
    lifeCycle,
  })

  const { unsubscribe: unsubscribeViewEnded } = lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, () => {
    flushMutations()
    addRecord({
      timestamp: timeStampNow(),
      type: RecordType.ViewEnd,
    })
  })
  const { unsubscribe: unsubscribeViewCreated } = lifeCycle.subscribe(
    LifeCycleEventType.VIEW_CREATED,
    (view: ViewCreatedEvent) => {
      takeSubsequentFullSnapshot(view.startClocks.timeStamp)
    }
  )

  return {
    stop: () => {
      unsubscribeViewEnded()
      unsubscribeViewCreated()
      stopRecording()
      stopSegmentCollection()
    },
  }
}

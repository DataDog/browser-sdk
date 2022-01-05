import {
  LifeCycle,
  LifeCycleEventType,
  ParentContexts,
  RumConfiguration,
  RumSessionManager,
} from '@datadog/browser-rum-core'

import { record } from '../domain/record'
import { startSegmentCollection, DeflateWorker } from '../domain/segmentCollection'
import { send } from '../transport/send'
import { RawRecord, RecordType } from '../types'

export function startRecording(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  parentContexts: ParentContexts,
  worker: DeflateWorker
) {
  const { addRecord, stop: stopSegmentCollection } = startSegmentCollection(
    lifeCycle,
    configuration.applicationId,
    sessionManager,
    parentContexts,
    (data, meta, rawSegmentSize, flushReason) =>
      send(configuration.sessionReplayEndpointBuilder, data, meta, rawSegmentSize, flushReason),
    worker
  )

  function addRawRecord(rawRecord: RawRecord) {
    addRecord({ ...rawRecord, timestamp: Date.now() })
  }

  const { stop: stopRecording, takeFullSnapshot, flushMutations } = record({
    emit: addRawRecord,
    defaultPrivacyLevel: configuration.defaultPrivacyLevel,
  })

  const { unsubscribe: unsubscribeViewEnded } = lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, () => {
    flushMutations()
    addRawRecord({
      type: RecordType.ViewEnd,
    })
  })
  const { unsubscribe: unsubscribeViewCreated } = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, takeFullSnapshot)

  return {
    stop: () => {
      unsubscribeViewEnded()
      unsubscribeViewCreated()
      stopRecording()
      stopSegmentCollection()
    },
  }
}

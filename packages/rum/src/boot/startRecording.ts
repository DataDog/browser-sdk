import { assign } from '@datadog/browser-core'
import type { LifeCycle, ParentContexts, RumConfiguration, RumSessionManager } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'

import { record } from '../domain/record'
import type { DeflateWorker } from '../domain/segmentCollection'
import { startSegmentCollection } from '../domain/segmentCollection'
import { send } from '../transport/send'
import type { RawRecord } from '../types'
import { RecordType } from '../types'

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
    (data, metadata, rawSegmentSize, flushReason) =>
      send(configuration.sessionReplayEndpointBuilder, data, metadata, rawSegmentSize, flushReason),
    worker
  )

  function addRawRecord(rawRecord: RawRecord) {
    addRecord(assign({ timestamp: Date.now() }, rawRecord))
  }

  const {
    stop: stopRecording,
    takeFullSnapshot,
    flushMutations,
  } = record({
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

import { Configuration } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType, ParentContexts, RumSession } from '@datadog/browser-rum-core'

import { record } from '../domain/record'
import { startSegmentCollection } from '../domain/segmentCollection'
import { send } from '../transport/send'
import { RawRecord, RecordType } from '../types'

export function startRecording(
  lifeCycle: LifeCycle,
  applicationId: string,
  configuration: Configuration,
  session: RumSession,
  parentContexts: ParentContexts,
  startSegmentCollectionImpl = startSegmentCollection
) {
  const segmentCollection = startSegmentCollectionImpl(
    lifeCycle,
    applicationId,
    session,
    parentContexts,
    (data, meta, rawSegmentSize, flushReason) =>
      send(configuration.sessionReplayEndpoint, data, meta, rawSegmentSize, flushReason)
  )
  if (!segmentCollection) {
    return
  }

  function addRawRecord(rawRecord: RawRecord) {
    segmentCollection!.addRecord({ ...rawRecord, timestamp: Date.now() })
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
      segmentCollection.stop()
    },
  }
}
